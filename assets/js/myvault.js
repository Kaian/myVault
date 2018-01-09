var EFFECT_TIME = 1750;
var EFFECT_TIME_EDITORS = 200;
var MINUTE = 60 * 1000;
var path_array = [];

var preferences = {
    vault_url   : "http://127.0.0.1:8200/v1/",
    secret_path : "/secret/",
    backup_path : "/backup/",
    theme       : "default",
    keep_editor : true,
    timers      : {
        logout           : 15,
        token_expiration : 0,
        auto_save        : 3
    },
    username    : ""
};
var timers = {
    logout           : false,
    token_expiration : setInterval(show_token_expiration_warning, MINUTE),
    auto_save        : false
};

function save_options(){
    var options = {
        vault_url   : $("#input_vault_url").val() || preferences.vault_url,
        secret_path : $("#input_vault_path").val() || preferences.secret_path,
        backup_path : $("#input_backup_path").val() || preferences.backup_path,
        theme       : $("#input_theme").val(),
        keep_editor : $("#check_keep_editor").is(":checked"),
        timers      : {
            logout           : $("#input_logout_timer").val(),
            auto_save        : $("#input_autosave_timer").val()
        }
    };
    $.extend(preferences,options);
    preferences.vault_url = $("#input_vault_url_preferences").val();
    set_theme(preferences.theme);
    localStorage.setItem("myvault_preferences", JSON.stringify(preferences));
    $("#options-modal").modal("hide");
}

function get_saved_options() {
    var options = JSON.parse(localStorage.getItem("myvault_preferences"));
    $.extend(preferences,options);
}

function login(method){
    var data = "";
    var headers = "";
    var action = "POST";
    var path = "";
    if (method == "ldap"){
        path = "/auth/ldap/login/"+document.getElementById("username").value;
        data = {password:document.getElementById("password").value};
    } else if (method == "token") {
        action = "GET";
        var token = document.getElementById("token").value;
        path = "/auth/token/lookup-self";
        headers = {"X-Vault-Token": token};
        data = {"token": "ClientToken"};
    }

    make_action(action,path,data,headers).done(function(res) {
        var policies = [];
        var expiration_time = 0;
        if (method == "ldap"){
            localStorage.setItem("myvault_token", res.auth.client_token);
            preferences.username = res.auth.metadata.username;
            policies = res.auth.policies.sort();
            expiration_time = Math.floor(new Date().getTime()/1000) + res.auth.lease_duration;
        } else if (method == "token"){
            localStorage.setItem("myvault_token", res.data.id);
            preferences.username = res.data.display_name;
            policies = res.data.policies.sort();
            // expir_time is null when root token
            if (res.data.expire_time !== null){
                expiration_time = res.data.creation_time + res.data.creation_ttl;
            }
        }
        localStorage.setItem("myvault_token_expiration_time",expiration_time);
        if (expiration_time > 0){
            var now = Math.floor(new Date().getTime()/1000);
            var minutes = Math.floor((expiration_time-now)/60);
            $("#token-timer").html(minutes + " mins");
        }
        $.each(policies,function(index,value){
            if (value.substring(0,9) == "clientes_"){
                var regexp = /^clientes_/;
                value = value.replace(regexp,"");
                preferences.secret_path = "/secret/clientes/"+value+"/";
                preferences.backup_path = "/backup"+preferences.secret_path;
            }
        });
        $("#login_modal").modal("hide");
        reset_timer();
        window.clearInterval(timers.token_expiration);
        timers.token_expiration = setInterval(show_token_expiration_warning, MINUTE);
        is_logged();
    }).fail(function(jqXHR, textStatus, errorThrown){
        if (jqXHR.readyState === 0){
            logout("There's a network error");
            $("#log_error").slideDown().delay(EFFECT_TIME).slideUp();
        }
        if (jqXHR.status >= 400) {
            $("#login_error").html(jqXHR.responseJSON.errors[0]).slideDown().delay(EFFECT_TIME).slideUp();
        }
    });

}

function get_token(){
    var token = localStorage.getItem("myvault_token");
    return token;
}

function set_theme(mode){
    if (mode == "dark"){
        $("html").addClass("dark");
        $("#todo").addClass("dark");
    } else {
        $("html").removeClass("dark");
        $("#todo").removeClass("dark");
    }
}

function show_token_expiration_warning(){
    var now = Math.floor(new Date().getTime()/1000);
    var expiration = localStorage.getItem("myvault_token_expiration_time");
    if (expiration > 0){
        minutes = Math.floor((expiration-now)/60);
        $("#token-timer").html(minutes + " mins");
        if (minutes < 5 && minutes > 1){
            $("#token_timer_minutes").html(minutes);
            if (($("#token_expiration_warning_modal").data("bs.modal") || {})._isShown){
                $("#token_expiration_warning_modal").modal("hide");
            } else {
                $("#token_expiration_warning_modal").modal("show");
            }
            $("#token-refresh-icon").show();
        } else if (minutes < 1){
            logout("Token has expired");
        }
    }
}

function renew_token(){
    var token = get_token();
    data = {increment: "2h"};
    make_action("POST","/auth/token/renew-self",data).done(function(response, textStatus, jqXHR){
        var now = Math.floor(new Date().getTime()/1000);
        var expiration = parseInt(localStorage.getItem("myvault_token_expiration_time"))+7200;
        localStorage.setItem("myvault_token_expiration_time",expiration);
        $("#token-refresh-icon").hide();
        minutes = Math.floor((expiration-now)/60);
        $("#token-timer").html(minutes + " mins");
        $("#log_success").html("Token has been renewed ").slideDown().delay(EFFECT_TIME).slideUp();
    });
}

function get_path(in_editor=false){
    var hash = window.location.hash.substring(2);
    if (hash.length == 0){
        hash =  preferences.secret_path;
    }
    if (in_editor){
        if (hash.indexOf("&")>0){
            var params= hash.split("&");
            hash = params[0];
        }
    }
    return hash;
}

function logout(error){
    if (localStorage.getItem("myvault_token")){
        //revoke token
        make_action("POST","/auth/token/revoke-self").done(function(response, textStatus, jqXHR){
            localStorage.removeItem("myvault_token");
        });
    }
    localStorage.removeItem("myvault_token_expiration_time");
    window.clearInterval(timers.logout);
    window.clearInterval(timers.token_expiration);
    window.clearInterval(timers.auto_save);
    $("#editormd").empty();
    $("#tree").empty();
    $("#login_modal").modal("show");
    //clean inputs
    $("#username, #password, #token").val("");
    $("#login_error").html(error).slideDown().delay(EFFECT_TIME).slideUp();
    set_theme("default");
}

function automatic_logout(){
    path = get_path();
    if (path.indexOf("&")>0){
        data = $("#editormd textarea").val();
        set_secret("automatic_logout",data,false,true,"");
    } else {
        logout("Automatic logout");
    }
}

function reset_timer(){
    window.clearInterval(timers.logout);
    timers.logout = setInterval(automatic_logout, preferences.timers.logout*MINUTE);
}

function reset_auto_save_timer(active_timer,action="",data="",create="",backup="",username=""){
    reset_timer();
    window.clearInterval(timers.auto_save);
    timers.auto_save = false;
    if (active_timer){
        //set_secret(action,data,create,backup,username)
        timers.auto_save = setInterval(set_secret.bind(null,action,data,create,backup,username), preferences.timers.auto_save*MINUTE);
    }
}

function is_logged(){
    if(window.location.search.substring(1) == "logout"){
        // we force logout if there's in the URL
        localStorage.removeItem("myvault_token");
    }
    get_saved_options();
    var token = get_token();
    if (!token){
        $("#login_modal").modal("show");
    } else {
        set_theme(preferences.theme);
        var path = get_path();
        reset_timer();
        get_secret();
        update_secret_tree();
    }
    $("#input_vault_url_preferences").val(preferences.vault_url);
}

function capabilities_allow(capabilities,policy){
    if (capabilities.indexOf("root") > -1){
        return true;
    } else if (capabilities.indexOf(policy) > -1){
        return true;
    } else {
        return false;
    }
}

function get_capabilities(path){
    var token = get_token();
    if (token === null){
        logout("There's no valid token");
    } else {
        data = {path: path.substring(1)};
        var promise = new Promise((resolve, reject) => {
            make_action("POST","/sys/capabilities-self",data).done(function(response, textStatus, jqXHR){
                resolve(jqXHR.responseJSON.capabilities);
            }).fail(function(jqXHR, textStatus, errorThrown){
                logout("There's no valid token");
            });
        });
        return promise;
    }
}

function get_tree(path) {
    var current_path = get_path();

    var promise = new Promise((resolve, reject) => {
        get_capabilities(path).then(function(capabilities_path){
            if (capabilities_allow(capabilities_path,"list")) {
                // be sure that we have permissions to list the path
                make_action("LIST",path).done(function (response) {
                    var promises = [];
                    var items = [];

                    $.each(response.data.keys.sort(), (index, value) => {
                        var link_path = path + value;

                        var item = {
                          text: value,
                          href: "#!" + link_path,
                          path: "#!" + path
                        };

                        if (current_path.substring(0,link_path.length) == link_path){
                            item.state = {
                                expanded: true
                            };
                            if (current_path == link_path){
                                item.state = {
                                    expanded: true,
                                    selected: true
                                };
                            }
                        }

                        if (value.substring(value.length - 1) == "/") {
                           promises.push(get_tree(path + value));
                        }

                        items.push(item);
                    });

                    Promise.all(promises).then(data => {
                        $.each(data, (index, value) => {
                            if (value != null){
                                var x = items.map(function(e){
                                    return e.href;
                                }).indexOf(value[0].path);
                                items[x].nodes = value;
                            }
                        });
                        resolve(items);
                    });
                });
            } else {
                // if we have no permissions to read, we resolve as null
                resolve(null);
            }
        });
    });

    return promise;
}

function expand_tree(){
    selected_node = $('#tree').treeview('getSelected');
    if (selected_node.length > 0){
        $('#tree').treeview('unselectNode', selected_node[0]);
    }

    nodes = $('#tree').treeview('getEnabled');
    path = "#!" + get_path();
    var parents = [];
    var n = -1;
    $.each(nodes, function (index, node) {
        if (path == node.href){
            n = node;
        }
    });
    $('#tree').treeview('selectNode',n);
}

function update_secret_tree(path="",admin=false){
    path = path || preferences.secret_path;
    get_tree(path).then(function (data) {
        var tree_options = {
            data:data,
            levels:1,
            color: "#2e2d30",
            selectedBackColor: "#b0232a",
            enableLinks:true,
            expandIcon: "fa fa-plus",
            collapseIcon: "fa fa-minus",
            onNodeSelected: function(event, node) {
                node = $("#tree").treeview("getSelected")[0];
                window.location.href = node.href;
                $("#tree").treeview("clearSearch");
                var parents = [];
                var n = $("#tree").treeview("getParent", node);
                parents.push(n.nodeId);
                while (parents[parents.length-1] != undefined){
                    n = $("#tree").treeview("getParent", n.nodeId);
                    parents.push(n.nodeId);
                }
                $("#tree").treeview("collapseAll", { silent: true });
                $.each(parents.reverse(), function (index, parent) {
                    if (parent != undefined){
                        $("#tree").treeview("expandNode", [ parent, { levels: 1, silent: true } ]);
                    }
                });
                $("#tree").treeview("expandNode", node.nodeId);
            }
        };
        if (admin){
            var admin_options = {
                showCheckbox : true,
                checkedIcon: "fa fa-check-square-o",
                uncheckedIcon: "fa fa-square-o"
            };
            $.extend(tree_options,admin_options);
        }
        $("#tree").treeview(tree_options);
    });
}

function search_tree(){
    var pattern = $("#input_search_tree").val();
    var results = $('#tree').treeview("search", [ pattern, { ignoreCase: true, exactMatch: false } ]);
    var output = '<p>' + results.length + ' matches found</p><ul id="search_results">';
    $.each(results, function (index, result) {
        var href = result.href.replace("#!","");
        output += '<li class="search_result"><a href="'+result.href+'">'+href+"</a></li>";
    });
    output += "</li>";
    $("#search_results").html(output);
    $("#search_results").show();
}

function update_breadcrumb() {
    path = get_path(true) || preferences.secret_path;
    $("#create_secret_path").html(path);
    var path = path.substring(1);
    var complete_path="#!";
    $("#secret_path").empty();
    var i = 0;
    var total = path.split("/").length-1;
    $.each(path.split("/"),function(index,value){
        complete_path=complete_path+"/"+value;
        var folder="";
        if (i < total){
            folder = "/";
        }
        $("#secret_path").append(
            $("<li>").attr("class","breadcrumb-item").append(
                $("<a>").attr("href",complete_path+folder).html(value)
            )
        );
        i++;
    });
}

function print_secret(data){
    var mywindow = window.open("", "new div", "height=400,width=600");
    mywindow.document.write("<html><head><title></title>");
    mywindow.document.write('<link rel="stylesheet" href="deps/editor.md/css/editormd.min.css">');
    mywindow.document.write("</head><body>");
    mywindow.document.write('<div class="markdown-body editormd-html-preview">');
    mywindow.document.write(data);
    mywindow.document.write("</div>");
    mywindow.document.write("</body></html>");
    setTimeout(function(){
        //FIXME: if not delayed, the document is not loaded
        mywindow.print();
    }, 2000);

}

function make_action(action,path,data="",headers=""){
    var token = get_token();
    if (headers == ""){
        headers = {"X-Vault-Token": token};
    }
    var options = {
        type: action,
        headers: headers,
        url: preferences.vault_url+path.substring(1),
        timeout: 5000,
        dataType: "json",
        contentType: "application/json"
    };
    var data_object = {};
    if (data != ""){
        data_object = {data: JSON.stringify(data)};
    }
    $.extend(options,data_object);
    return $.ajax(options);
}

function set_vault_secret(path,data,backup=true,locked_by="",action=""){
    var json_item = {};
    json_item.data = data;
    json_item.date = (new Date ()).getTime();
    json_item.action = action;
    json_item.by = preferences.username;
    json_item.data = data;
    json_item.locked_by = locked_by;

    if (backup){
        backup_secret(path,locked_by,action);
    }
    return make_action("PUT",path,json_item);
}

function move_secret(path,new_path){
    //we must make sure that the user has capabilities to move the secret
    get_capabilities(path).then(function(capabilities_path){
        if (capabilities_allow(capabilities_path,"delete")) {
            get_capabilities(new_path).then(function(capabilities_new_path){
                if (capabilities_allow(capabilities_new_path,"create") || capabilities_allow(capabilities_new_path,"update")) {
                    //now we can move the secret
                    make_action("GET",path).done(function(response, textStatus, jqXHR){
                        set_vault_secret(new_path,response.data.data,true,"","moved from "+path).done(function(response, textStatus, jqXHR){
                            $("#move_modal").modal("hide");
                            $("#log_success").html("Secret has been moved to "+new_path).slideDown().delay(EFFECT_TIME).slideUp();
                            make_action("DELETE",path).done(function(){
                                window.location.href = "#!"+new_path;
                                update_secret_tree();
                            });
                        });
                    });
                } else {
                    $("#log_error").html("You cannot move the secret into the new path").slideDown().delay(EFFECT_TIME).slideUp();
                }
            });
        } else {
            $("#log_error").html("You cannot move/delete the secret").slideDown().delay(EFFECT_TIME).slideUp();
        }
    });
}

function unlock_secret(){
    path = get_path();
    make_action("GET",path).done(function(response, textStatus, jqXHR){
        set_secret("unlocked",response.data.data,false,true,"");
    });
}

function backup_secret(path,locked_by,action){
    var date = (new Date ()).getTime();
    make_action("GET",path).done(function(response, textStatus, jqXHR){
        set_vault_secret(preferences.backup_path+path.substring(1)+"__"+date,response.data.data,false,response.data.locked_by,response.data.action);
    });
}

function delete_secret(path){
    make_action("DELETE",path).done(function(response, textStatus, jqXHR){
        window.location.href = "#!"+preferences.secret_path;
        $("#log_error").html("Secret has been deleted").slideDown().delay(EFFECT_TIME).slideUp();
        $("#editors").hide();
        $("#create_secret").show();
    });
    update_secret_tree();
}

function set_secret(action,data,create,backup,locked_by){
    var token = get_token();
    var path = "";

    if (action == "created"){
        path = $("#create_secret_path").html()+$("#new_secret_name").val();
    } else {
        path = get_path(true);
    }
    if (action == "auto-saved") {
        if (preferences.keep_editor != true) {
            locked_by = "";
            action = "auto-saved-closed";
        }
    }

    set_vault_secret(path,data,backup,locked_by,action).done(function(response, textStatus, jqXHR){
        $("#log_success").html("Secret has been "+action).slideDown().delay(EFFECT_TIME).slideUp();
        if (create){
            window.location.href = "#!"+path+"&edit=1";
            update_secret_tree();
        }
        if (action == "unlocked" || action == "closed"){
            get_secret();
        }
        if (action == "automatic_logout"){
            get_secret();
            logout("Automatic logout");
        }
        if (action == "auto-saved-closed") {
            window.location.href = "#!"+get_path(1);
        }
        reset_timer();
    }).fail(function(jqXHR, textStatus, errorThrown){
        $("#log_error").html("Secret has NOT been "+action+"<br/><br/>ERROR: "+errorThrown);
        $("#log_error").slideDown().delay(EFFECT_TIME).slideUp();
    });
}

function get_secret(){
    var token = get_token();
    var path = get_path();
    var edit = false;
    var edit_url = false;
    $("#create_secret").hide();
    $("#log_info").hide();
    if (path.indexOf("&")>0){
        var params= path.split("&");
        path = params[0];
        if (params[1].split("=")[0] == "edit"){
            edit = true;
            edit_url = true;
        }
    }
    update_breadcrumb();

    get_capabilities(path).then(function(capabilities){

        if (path.substring(path.length-1) == "/"){
            $("#editormd").empty();
            //directory
            $("#editors").slideUp(EFFECT_TIME_EDITORS);
            if (capabilities_allow(capabilities,"create")) {
                $("#create_secret").show();
                $("#new_secret_name").val("");
            } else {
                $("#log_info").html("You have no permissions to create a secret here").slideDown().delay(EFFECT_TIME).slideUp();
            }

            if (capabilities_allow(capabilities,"list")){
                make_action("LIST",path).done(function(response, textStatus, jqXHR){
                    $("#secrets_keys").empty();
                    $.each(response.data.keys.sort(), (index, value) => {
                        $("#secrets_keys").append(
                            $("<li>").attr("class","list-group-item float-left col-xs-6 col-md-4").append(
                                $("<a>").attr("href","#!"+path+value).html(value)
                            )
                        );
                    });
                }).fail(function(jqXHR, textStatus, errorThrown){
                    if (jqXHR.status != 200){
                        if (jqXHR.readyState == 0){
                            $('#log_error').html("Network Error").slideDown().delay(EFFECT_TIME).slideUp();
                        } else {
                            $('#log_error').html(jqXHR.statusText).slideDown().delay(EFFECT_TIME).slideUp();
                        }
                    }
                });
            }
        } else if (path.length > 0) {
            $("#editormd").empty().removeAttr('class').css('height', 'auto');
            $("#editormd").append('<textarea style="display:none">');
            $(".button").hide();
            $("#secrets_keys").empty();

            if (capabilities_allow(capabilities,"read")) {

                make_action("GET",path).done(function(response, textStatus, jqXHR){
                    $("#editors").slideDown(EFFECT_TIME_EDITORS);
                    $("#editormd textarea").text(response.data.data);
                    $("#search_results").hide();

                    if (response.data.locked_by){
                        if (edit_url){
                            window.location.href = "#!"+path;
                        }
                        edit = false;
                        $("#log_info").html("Secret is locked by <b>'" + response.data.locked_by + "'</b>").slideDown();
                        if (capabilities_allow(capabilities,"create") || capabilities_allow(capabilities,"update")) {
                            $("#unlock_secret_btn").show();
                        }
                        $("#edit_secret_btn, #move_secret_btn, #delete_secret_btn").hide();
                    } else {
                        // make sure that the buttons aren't hidden, depends of permissions
                        if (capabilities_allow(capabilities,"create") || capabilities_allow(capabilities,"update") ) {
                            $("#edit_secret_btn").show();
                            $("#unlock_secret_btn").hide();
                        }
                        if (capabilities_allow(capabilities,"delete")) {
                            $("#move_secret_btn, #delete_secret_btn").show();
                        }
                    }
                    $("#print_secret_btn").show();

                    $("#backups_secret_btn").show();

                    var editormarkdown = "";
                    var editor_options = {
                        // height             : 800,
                        mode               : "gfm", // https://codemirror.net/mode/gfm/
                        tocm               : true,
                        tocTitle           : "TOCM",
                        htmlDecode         : "script,iframe",
                        emoji              : true,
                        taskList           : true,
                        tex                : true,
                        flowChart          : true,
                        sequenceDiagram    : true,
                    };
                    if (preferences.theme == "dark"){
                        $.extend(editor_options,{
                            theme              : "dark",
                            previewTheme       : "dark",
                            editorTheme        : "pastel-on-dark",
                        });
                    } else {
                        $.extend(editor_options,{
                            theme              : "default",
                            previewTheme       : "default",
                            editorTheme        : "default",
                        });
                    }
                    if (edit) {
                        $("#functions_buttons").hide();

                        // extending editor.md
                        $.extend(editor_options,{
                            width              : "100%",
                            path               : "deps/editor.md/lib/",
                            codeFold           : true,
                            saveHTMLToTextarea : true,
                            searchReplace      : true,
                            autoCloseTags      : true,
                            toolbarAutoFixed   : true,
                            toolbarIcons : function(){
                                return ["undo", "redo", "|",
                                    "bold", "del", "italic", "quote", "|",
                                    "h1", "h2", "h3", "h4", "|",
                                    "list-ul", "list-ol", "hr", "|",
                                    "link", "reference-link", "image", "code",
                                    "code-block",
                                    "table", "emoji", "pagebreak", "|",
                                    "watch", "preview", "search", "fullscreen"
                                ];
                            },
                            onload : function() {
                                var keyMap = {
                                    "Ctrl-S": function(cm) {
                                        set_secret("updated",editormarkdown.getMarkdown(),false,true,preferences.username);
                                        reset_auto_save_timer(true,"auto-saved",editormarkdown.getMarkdown(),false,true,preferences.username);
                                    },
                                    "Ctrl-Q": function(cm) {
                                        var path = get_path();
                                        path = path.replace('&edit=1', '');
                                        set_secret("closed",editormarkdown.getMarkdown(),false,true,"");
                                        window.location.href = "#!"+path;
                                        update_secret_tree();
                                    }
                                };
                                this.addKeyMap(keyMap);

                                set_secret("locked",response.data.data,false,true,preferences.username);
                                reset_auto_save_timer(true,"auto-saved",editormarkdown.getMarkdown(),false,true,preferences.username);
                                // Awesome hack to add "save" and close buttons :D
                                $("ul.editormd-menu")
                                    .prepend(
                                        '<li><a href="javascript:;" id="close_secret_btn" title="Close/Unlock" unselectable="on">\
                                        <i class="fa fa-close" unselectable="on"></i></a></li>\
                                        <li><a href="javascript:;" id="editor_update_secret_btn" title="Save" unselectable="on">\
                                        <i class="fa fa-floppy-o" unselectable="on"></i></a></li>');
                                $("#close_secret_btn").click(function(){
                                    var path = get_path();
                                    path = path.replace('&edit=1', '');
                                    set_secret("closed",editormarkdown.getMarkdown(),false,true,"");
                                    update_secret_tree();
                                    window.location.href = "#!"+path;
                                });
                                $("#editor_update_secret_btn").click(function(){
                                    set_secret("updated",editormarkdown.getMarkdown(),false,true,preferences.username);
                                    reset_auto_save_timer(true,"auto-saved",editormarkdown.getMarkdown(),false,true,preferences.username);
                                });

                                $('.markdown-toc a').click(function(e) {
                                    e.preventDefault();
                                    var hash = this.hash;
                                    var offset = $('#editormd').outerHeight();
                                    var target = $("a[name='"+hash.substring(1)+"'].reference-link").offset().top ;
                                    $('html, body, markdown-body').stop(true, true).animate({ scrollTop: target}, 500, function () {});
                                    return false;
                                });
                            },
                            onchange : function() {
                                reset_auto_save_timer(true,"auto-saved",editormarkdown.getMarkdown(),false,true,preferences.username);
                            },
                        });
                        editormarkdown = editormd("editormd", editor_options);
                    } else {
                        $("#functions_buttons").show();
                        // just show the secret
                        editormarkdown = editormd.markdownToHTML("editormd", editor_options );
                        $('div.markdown-toc a').click(function(e) {
                            e.preventDefault();
                            var hash = this.hash;
                            var offset = $('#editormd').outerHeight();
                            var target = $("a[name='"+hash.substring(1)+"'].reference-link").offset().top ;
                            $('html, body').stop(true, true).animate({ scrollTop: target}, 500, function () {});
                            return false;
                        });
                    }
                }).fail(function(jqXHR, textStatus, errorThrown){
                    $('#log_error').html("Secret not found").slideDown().delay(EFFECT_TIME).slideUp();
                    $("#editors").slideUp(EFFECT_TIME_EDITORS);
                });
            } else {
                $("#log_error").html("You cannot read the secret").slideDown().delay(EFFECT_TIME).slideUp();
            }
        }
    });
}

function browse_secret_backups(){
    var path = get_path();
    var token = get_token();
    var regexp = /(\w*)$/;
    var orig_path = path.replace(regexp,"");
    var secret = path.replace(orig_path,"");
    var backups = [];

    make_action("LIST",preferences.backup_path+orig_path.substring(1)).done(function(response, textStatus, jqXHR){
        // empty the backups table
        $("#backups_table_body").empty();

        $.each(response.data.keys.sort(), (index, value) => {
            if (value.startsWith(secret+"__")){
                var item = {};
                item.href = "#!"+preferences.backup_path+orig_path.substring(1)+value;
                var re = new RegExp(secret+"\_\_\(\\d+\)");
                var date = re.exec(value);
                var d = new Date(parseInt(date[1]));
                item.date = d.toISOString();
                backups.push(item);
            }
        });
        $.each(backups.reverse(), (index, value) => {
            var tr = "<tr><td>"+value.date+'</td><td><a href="'+value.href+'" target="_blank">Show</a>'+"</td></tr>";
            $("#backups_table_body").append(tr);
        });
        $("#backups_modal").modal("show");
    }).fail(function(jqXHR, textStatus, errorThrown){
        $("#log_error").html("There are no backups or there has been an error: " + errorThrown).slideDown().delay(EFFECT_TIME).slideUp();
    });
}

function hash_changed(event){
    if (timers.auto_save == false){
        reset_auto_save_timer(false);
        get_secret();
        reset_timer();
        expand_tree();
    } else {
        if (event.oldURL.indexOf("&")>0){
            if (event.oldURL == (event.newURL+"&edit=1")){
                window.location = event.newURL;
                reset_auto_save_timer(false);
                reset_timer();
                get_secret();
                expand_tree();
            } else {
                window.location = event.oldURL;
                $("#warning_modal span#hidden_new_url").html(event.newURL);
                $("#warning_modal").modal("show");
            }
        }
    }
}
