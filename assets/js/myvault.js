// global variables
// TODO: this should be made in better way :-)
var VAULT_URL = "http://127.0.0.1:8200/v1/";
var DEFAULT_SECRET_PATH = "/secret/";
var BACKUP_SECRET_PATH  = "/backup/";
var EFFECT_TIME = 1750;
var EFFECT_TIME_EDITORS = 200;
var DEFAULT_TIMER = 15*60*1000; //minutes*secs*milliseconds
var DEFAULT_AUTO_SAVE_TIMER = 3*60*1000;
var path_array = [];

var TIMER = false;
var AUTO_SAVE_TIMER = false;
var TOKEN_EXPIRATION_TIMER = setInterval(show_token_expiration_warning, 60*1000);
// end global variables

function save_options(){
    if ($("#input_vault_url_preferences").val() != ""){
        // for preferences tab
        VAULT_URL = $("#input_vault_url_preferences").val();
        localStorage.setItem("ironvault_url", VAULT_URL);
    }

    if ($("#input_vault_url").val() != ""){
        VAULT_URL = $("#input_vault_url").val();
        localStorage.setItem("ironvault_url", VAULT_URL);
    }
    if ($("#input_vault_path").val() != ""){
        DEFAULT_SECRET_PATH = $("#input_vault_path").val();
        localStorage.setItem("ironvault_path", DEFAULT_SECRET_PATH);
    }
    if ($("#input_vault_path").val() != ""){
        BACKUP_SECRET_PATH = $("#input_backup_path").val();
        localStorage.setItem("ironvault_backup_path", BACKUP_SECRET_PATH);
    }
    localStorage.setItem("ironvault_logout_timer",$("#input_logout_timer").val()*60*1000);
    localStorage.setItem("ironvault_autosave_timer",$("#input_autosave_timer").val()*60*1000);
    localStorage.setItem("ironvault_keep_editor_autosave",$("#check_keep_editor").is(":checked"));
    $("#options-modal").modal("hide");
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
            localStorage.setItem("ironvault_token", res.auth.client_token);
            localStorage.setItem("ironvault_accessor", res.auth.accessor);
            localStorage.setItem("ironvault_username", res.auth.metadata.username);
            policies = res.auth.policies.sort();
            expiration_time = Math.floor(new Date().getTime()/1000) + res.auth.lease_duration;
        } else if (method == "token"){
            localStorage.setItem("ironvault_token", res.data.id);
            localStorage.setItem("ironvault_username", res.data.display_name);
            policies = res.data.policies.sort();
            // expir_time is null when root token
            if (res.data.expire_time != null){
                expiration_time = res.data.creation_time + res.data.creation_ttl;
            }
        }
        localStorage.setItem("ironvault_token_expiration_time",expiration_time);
        if (expiration_time > 0){
            var now = Math.floor(new Date().getTime()/1000);
            var minutes = Math.floor((expiration_time-now)/60);
            $("#token-timer").html(minutes + " mins");
        }
        $.each(policies,function(index,value){
            if (value.substring(0,9) == "clientes_"){
                var regexp = /^clientes_/;
                var value = value.replace(regexp,"");
                DEFAULT_SECRET_PATH = "/secret/clientes/"+value+"/";
                localStorage.setItem("ironvault_path", DEFAULT_SECRET_PATH);
                BACKUP_SECRET_PATH  = "/backup"+DEFAULT_SECRET_PATH;
                localStorage.setItem("ironvault_backup_path", BACKUP_SECRET_PATH);
            }
        });
        $("#login_modal").modal("hide");
        reset_timer();
        window.clearInterval(TOKEN_EXPIRATION_TIMER);
        TOKEN_EXPIRATION_TIMER = setInterval(show_token_expiration_warning, 60*1000);
        is_logged();
    }).fail(function(jqXHR, textStatus, errorThrown){
        if (jqXHR.readyState == 0){
            logout("There's a network error");
            $("#log_error").slideDown().delay(EFFECT_TIME).slideUp();
        }
        if (jqXHR.status >= 400) {
            $("#login_error").html(jqXHR.responseJSON.errors[0]).slideDown().delay(EFFECT_TIME).slideUp();
        }
    });

}

function get_token(){
    return localStorage.getItem("ironvault_token");
}

function show_token_expiration_warning(){
    var now = Math.floor(new Date().getTime()/1000);
    var expiration = localStorage.getItem("ironvault_token_expiration_time");
    if (expiration > 0){
        minutes = Math.floor((expiration-now)/60);
        $("#token-timer").html(minutes + " mins");
        if (minutes < 5 && minutes > 1){
            $("#token_timer_minutes").html(minutes);
            $("#token_expiration_warning_modal").modal("show");
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
        var expiration = parseInt(localStorage.getItem("ironvault_token_expiration_time"))+7200;
        localStorage.setItem("ironvault_token_expiration_time",expiration);
        $("#token-refresh-icon").hide();
        minutes = Math.floor((expiration-now)/60);
        $("#token-timer").html(minutes + " mins");
        $("#log_success").html("Token has been renewed ").slideDown().delay(EFFECT_TIME).slideUp();
    });
}

function get_path(in_editor=false){
    var hash = window.location.hash.substring(2);
    if (hash.length == 0){
        hash =  DEFAULT_SECRET_PATH;
    }
    if (in_editor){
        if (hash.indexOf("&")>0){
            var params= hash.split("&")
            hash = params[0];
        }
    }
    return hash;
}

function logout(error){
    if (localStorage.getItem("ironvault_token")){
        //revoke token
        make_action("PUT","/auth/token/revoke-self");
        localStorage.removeItem('ironvault_token');
        $("#login_modal").modal("show");
        //clean inputs
        $("#username, #password, #token").val("");
        $("#login_error").html(error).slideDown().delay(EFFECT_TIME).slideUp();
    }
    localStorage.removeItem('ironvault_path');
    localStorage.removeItem('ironvault_backup_path');
    localStorage.removeItem('ironvault_token_expiration_time');
    window.clearInterval(TIMER);
    window.clearInterval(TOKEN_EXPIRATION_TIMER);
    $("#editormd").empty();
    $("#tree").empty();
}

function automatic_logout(){
    logout("Automatic logout");
}

function reset_timer(){
    window.clearInterval(TIMER);
    TIMER = setInterval(automatic_logout, localStorage.getItem("ironvault_logout_timer") || DEFAULT_TIMER);
}

function reset_auto_save_timer(active_timer,action="",data="",create="",backup="",username=""){
    window.clearInterval(AUTO_SAVE_TIMER);
    AUTO_SAVE_TIMER = false;
    if (active_timer){
        //set_secret(action,data,create,backup,username)
        AUTO_SAVE_TIMER = setInterval(set_secret.bind(null,action,data,create,backup,username), localStorage.getItem("ironvault_autosave_timer") || DEFAULT_AUTO_SAVE_TIMER);
    }
}

function is_logged(){
    if(window.location.search.substring(1) == "logout"){
        // we force logout if there's in the URL
        localStorage.removeItem("ironvault_token");
    }
    var token = get_token();
    if (!token){
        $("#login_modal").modal("show");
    } else {
        VAULT_URL = localStorage.getItem("ironvault_url") || VAULT_URL;
        DEFAULT_SECRET_PATH = localStorage.getItem("ironvault_path") || DEFAULT_SECRET_PATH;
        BACKUP_SECRET_PATH  = localStorage.getItem("ironvault_backup_path") || BACKUP_SECRET_PATH;
        var path = get_path();
        reset_timer();
        get_secret();
        update_secret_tree()
    }
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
    data = {path: path.substring(1)}
    var promise = new Promise((resolve, reject) => {
        make_action("POST","/sys/capabilities-self",data).done(function(response, textStatus, jqXHR){
            resolve(jqXHR.responseJSON.capabilities);
        });
    });
    return promise;
}

function get_tree(path) {
    var current_path = get_path();

    var promise = new Promise((resolve, reject) => {
        make_action("LIST",path).done(function (response) {
            var promises = []
            var items = []

            $.each(response.data.keys.sort(), (index, value) => {
                var link_path = path + value;

                var item = {
                  text: value,
                  href: "#!" + link_path,
                  path: "#!" + path
                };

                if (current_path.substring(0,link_path.length) == link_path){
                    item["state"] = {
                        expanded: true
                    }
                    if (current_path == link_path){
                        item["state"] = {
                            expanded: true,
                            selected: true
                        }
                    }
                }

                if (value.substring(value.length - 1) == "/") {
                   promises.push(get_tree(path + value));
                }

                items.push(item);
            });

            Promise.all(promises).then(data => {
                $.each(data, (index, value) => {
                   var x = items.map(function(e){
                       return e['href'];
                   }).indexOf(value[0]['path'])
                   items[x]['nodes'] = value;
                });
                resolve(items);
            });
        });
    });

    return promise;
}

function update_secret_tree(){
    get_tree(DEFAULT_SECRET_PATH).then(function (data) {
        var keys_tree = $("#tree").treeview({
            data:data,
            levels:1,
            color: "#2e2d30",
            selectedBackColor: "#b0232a",
            enableLinks:true,
            expandIcon: "fa fa-plus",
            collapseIcon: "fa fa-minus",
            onNodeSelected: function(event, node) {
                var node = $('#tree').treeview("getSelected")[0];
               window.location.href = node.href;
                $('#tree').treeview('expandNode', node.nodeId);
            }
        });

        // search tree
        var findExpandibleNodess = function() {
            return keys_tree.treeview("search", [ $("#input_search_tree").val(), { ignoreCase: true, exactMatch: false } ]);
        };
        var expandibleNodes = findExpandibleNodess();
        
        var search = function(e) {
            var pattern = $("#input_search_tree").val();
            var results = keys_tree.treeview('search', [ pattern, { ignoreCase: true, exactMatch: false } ]);
            var output = '<p>' + results.length + ' matches found</p>';
            $.each(results, function (index, result) {
                output += '<p><a href="'+result.href+'">'+result.text+"</a></p>";
            });
            $("#search_results").html(output);
            $("#search_results").show();
        }
        
        // Expand/collapse/toggle nodes
        $('#input_search_tree').on('keyup', function (e) {
            expandibleNodes = findExpandibleNodess();
            $('.expand-node').prop('disabled', !(expandibleNodes.length >= 1));
            search();
        });
    });
}

function update_breadcrumb() {
    path = get_path(true) || DEFAULT_SECRET_PATH;
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
    var mywindow = window.open('', 'new div', 'height=400,width=600');
    mywindow.document.write('<html><head><title></title>');
    mywindow.document.write('<link rel="stylesheet" href="deps/editor.md/css/editormd.min.css">');
    mywindow.document.write('</head><body>');
    mywindow.document.write('<div class="markdown-body editormd-html-preview">');
    mywindow.document.write(data);
    mywindow.document.write('</div>');
    mywindow.document.write('</body></html>');
    setTimeout(function(){
        //FIXME: if not delayed, the document is not loaded
        mywindow.print();
    }, 2000);

}

function make_action(action,path,data="",headers=""){
    VAULT_URL = localStorage.getItem("ironvault_url") || VAULT_URL;
    var token = get_token();
    if (headers == ""){
        headers = {"X-Vault-Token": token};
    }
    return $.ajax({
        type: action,
        headers: headers,
        url: VAULT_URL+path.substring(1),
        timeout: 5000,
        dataType: "json",
        data: JSON.stringify(data),
        contentType: "application/json"
    });
}

function set_vault_secret(path,data,backup=true,username=""){
    var json_item = {};
    json_item["ironvault"] = "markdown";
    json_item["data"] = data;
    if (username != ""){
        json_item["username"] = username;
    }

    if (backup){
        backup_secret(path);
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
                        set_vault_secret(new_path,response.data["data"]).done(function(response, textStatus, jqXHR){
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
        set_secret("unlocked",response.data["data"],false,false,"");
    });
}

function backup_secret(path){
    var date = (new Date).getTime();
    make_action("GET",path).done(function(response, textStatus, jqXHR){
        set_vault_secret(BACKUP_SECRET_PATH+path.substring(1)+"__"+date,response.data["data"],false);
    });
}

function delete_secret(path){
    make_action("DELETE",path).done(function(response, textStatus, jqXHR){
        window.location.href = "#!"+DEFAULT_SECRET_PATH;
        $("#log_error").html("Secret has been deleted").slideDown().delay(EFFECT_TIME).slideUp();
        $("#editors").hide();
        $("#create_secret").show();
    });
    update_secret_tree();
}

function set_secret(action,data,create,backup,username){
    var token = get_token();
    var path = "";

    if (action == "created"){
        path = $("#create_secret_path").html()+$("#new_secret_name").val();
    } else {
        path = get_path(true);
    }

    set_vault_secret(path,data,backup,username).done(function(response, textStatus, jqXHR){
        $("#log_success").html("Secret has been "+action).slideDown().delay(EFFECT_TIME).slideUp();
        if (create){
            window.location.href = "#!"+path+"&edit=1";
            update_secret_tree();
        }
        if (action == "unlocked"){
            get_secret();
        }
        if (action == "auto-saved"){
            var params= path.split("&")
            path = params[0];
            if (localStorage.getItem("ironvault_keep_editor_autosave") != "true") {
                window.location.href = "#!"+path;
            }
        }
    }).fail(function(jqXHR, textStatus, errorThrown){
        $("#log_error").html("Secret has NOT been "+action+"<br/><br/>ERROR: "+errorThrown);
        $("#log_error").slideDown().delay(EFFECT_TIME).slideUp();
    });
}

function get_secret(){
    var token = get_token();
    var path = get_path();
    var edit = false;
    $("#create_secret").hide();
    $("#log_info").hide();
    if (path.indexOf("&")>0){
        var params= path.split("&")
        path = params[0];
        if (params[1].split("=")[0] == "edit"){
            edit = true
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
                make_action("LIST",path).fail(function(jqXHR, textStatus, errorThrown){
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

            if (capabilities_allow(capabilities,"read")) {

                make_action("GET",path).done(function(response, textStatus, jqXHR){
                    $("#editors").slideDown(EFFECT_TIME_EDITORS);
                    $("#editormd textarea").text(response.data["data"]);
                    $("#search_results").hide();

                    if (response.data["username"]){
                        edit = false;
                        $("#log_info").html("Secret is locked by <b>'" + response.data["username"] + "'</b>").slideDown();
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
                        htmlDecode         : "style,script,iframe",
                        emoji              : true,
                        taskList           : true,
                        tex                : true,
                        flowChart          : true,
                        sequenceDiagram    : true,
                    };
                    if (edit) {
                        var editormarkdown = "";
                        $("#functions_buttons").hide();

                        // extending editor.md 
                        $.extend(editor_options,{
                            width              : "100%",
                            path               : "deps/editor.md/lib/",
                            codeFold           : true,
                            // saveHTMLToTextarea : true,
                            searchReplace      : true,
                            autoCloseTags      : true,
                            toolbarAutoFixed   : false,
                            toolbarIcons : function(){
                                return ["undo", "redo", "|",
                                    "bold", "del", "italic", "quote", "|",
                                    "h1", "h2", "h3", "h4", "|",
                                    "list-ul", "list-ol", "hr", "|",
                                    "link", "reference-link", "image", "code",
                                    "code-block",
                                    "table", "emoji", "pagebreak", "|",
                                    "watch", "preview", "search", "fullscreen"
                                ]
                            },
                            onload : function() {
                                var keyMap = {
                                    "Ctrl-S": function(cm) {
                                        set_secret("updated",editormarkdown.getMarkdown(),false,true,localStorage.getItem("ironvault_username"));
                                        reset_auto_save_timer(true,"auto-saved",editormarkdown.getMarkdown(),false,false,"");
                                    },
                                    "Ctrl-Q": function(cm) {
                                        var path = get_path();
                                        path = path.replace('&edit=1', '');
                                        set_secret("unlocked",editormarkdown.getMarkdown(),false,false,"");
                                        window.location.href = "#!"+path;
                                        update_secret_tree();
                                    }
                                };
                                this.addKeyMap(keyMap);
                                
                                set_secret("locked",editormarkdown.getMarkdown(),false,false,localStorage.getItem("ironvault_username"));
                                reset_auto_save_timer(true,"auto-saved",editormarkdown.getMarkdown(),false,false,"");
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
                                    set_secret("unlocked",editormarkdown.getMarkdown(),false,false,"");
                                    update_secret_tree();
                                    window.location.href = "#!"+path;
                                });
                                $("#editor_update_secret_btn").click(function(){
                                    set_secret("updated",editormarkdown.getMarkdown(),false,true,localStorage.getItem("ironvault_username"));
                                    reset_auto_save_timer(true,"auto-saved",editormarkdown.getMarkdown(),false,false,"");
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
                                reset_auto_save_timer(true,"auto-saved",editormarkdown.getMarkdown(),false,true,"");
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

    make_action("LIST",BACKUP_SECRET_PATH+orig_path.substring(1)).done(function(response, textStatus, jqXHR){
        // empty the backups table
        $("#backups_table_body").empty();

        $.each(response.data.keys.sort(), (index, value) => {
            if (value.startsWith(secret+"__")){
                var item = {};
                item["href"] = "#!"+BACKUP_SECRET_PATH+orig_path.substring(1)+value;
                var re = new RegExp(secret+"\_\_\(\\d+\)")
                var date = re.exec(value);
                var d = new Date(parseInt(date[1]));
                item["date"] = d.toISOString();
                backups.push(item);
            }
        });
        $.each(backups.reverse(), (index, value) => {
            var tr = "<tr><td>"+value["date"]+'</td><td><a href="'+value["href"]+'" target="_blank">Show</a>'+"</td></tr>"
            $("#backups_table_body").append(tr);
        });
        $("#backups_modal").modal("show");
    }).fail(function(jqXHR, textStatus, errorThrown){
        $("#log_error").html("There are no backups or there has been an error: " + errorThrown).slideDown().delay(EFFECT_TIME).slideUp();
    });
}

function hash_changed(event){
    if (AUTO_SAVE_TIMER == false){
        reset_auto_save_timer(false);
        get_secret();
        reset_timer();
    } else {
        if (event.oldURL.indexOf("&")>0){
            if (event.oldURL == (event.newURL+"&edit=1")){
                window.location = event.newURL;
                reset_auto_save_timer(false);
                reset_timer();
                get_secret();
            } else {
                window.location = event.oldURL;
                $("#warning_modal span#hidden_new_url").html(event.newURL);
                $("#warning_modal").modal("show");
            }
        }
    }
}

$(document).ready(function(){
    $("#logout").click(function(){
        logout("You have been logout");
    });

    $("#create_secret_btn").click(function(){
        set_secret("created","",true,false,"");
    });

    $("#edit_secret_btn").click(function(){
        var path = get_path();
        window.location.href = "#!"+path+"&edit=1";
        update_secret_tree();
    });

    $("#backups_secret_btn").click(function(){
        browse_secret_backups();
    });

    $("#unlock_secret_btn").click(function(){
        unlock_secret();
    });

    $("#print_secret_btn").click(function(){
        print_secret($("#editormd").html());
    });

    window.addEventListener("hashchange", hash_changed, false);

    is_logged();

});
