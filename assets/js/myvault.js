// global variables
// TODO: this should be made in better way :-)
var VAULT_URL = "http://127.0.0.1:8200/v1/";
var DEFAULT_SECRET_PATH = "/secret/";
var BACKUP_SECRET_PATH  = "/backup/";
var EFFECT_TIME = 1750;
var EFFECT_TIME_EDITORS = 200;
var DEFAULT_TIMER = 15*60*1000; //minutes*secs*milliseconds
var path_array = [];

var TIMER = setInterval(automatic_logout, DEFAULT_TIMER);
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
        if (method == "ldap"){
            localStorage.setItem("ironvault_token", res.auth.client_token);
            localStorage.setItem("ironvault_accessor", res.auth.accessor);
            localStorage.setItem("ironvault_username", res.auth.metadata.username);
        } else if (method == "token"){
            localStorage.setItem("ironvault_token", res.data.id);
            localStorage.setItem("ironvault_username", res.data.meta.username);
        }
        $("#login_modal").modal("hide");
        is_logged();
    }).fail(function(jqXHR, textStatus, errorThrown){
        if (jqXHR.readyState == 0){
            logout("There's a network error");
            $('#log_error').slideDown().delay(EFFECT_TIME).slideUp();
        } 
        if (jqXHR.status >= 400) {
            $("#login_error").html(jqXHR.responseJSON.errors[0]).slideDown().delay(EFFECT_TIME).slideUp();
        }
    });

}

function get_token(){
    return localStorage.getItem("ironvault_token");
}

function get_path(){
    var hash = window.location.hash.substring(2);
    if (hash.length == 0){
        hash =  DEFAULT_SECRET_PATH;
    }
    return hash;
}

function logout(error){
    if (localStorage.getItem("ironvault_token")){
        localStorage.removeItem('ironvault_token');
        $("#login_modal").modal("show");
        //clean inputs
        $("#username, #password, #token").val("");
        $("#login_error").html(error).slideDown().delay(EFFECT_TIME).slideUp();
        //revoke token
        make_action("PUT","/auth/token/revoke-self");
    }
}

function automatic_logout(){
    logout("Automatic logout");
}

function reset_timer(){
    window.clearInterval(TIMER)
    TIMER = setInterval(automatic_logout, localStorage.getItem("ironvault_logout_timer") || DEFAULT_TIMER);
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
        if (path.length > 0) {
            if (path.substring(path.length-1) == "/"){
                // we're in a directory
                browse_secrets(path);
            } else {
                get_secret();
            }
        } else {
            browse_secrets(DEFAULT_SECRET_PATH);
        }

        update_secret_tree()
    }
}

function get_tree(path) {
    var current_path = get_path();

    var promise = new Promise((resolve, reject) => {
        make_action("LIST",path).always(function (response) {
            var promises = []
            var items = []

            $.each(response.data.keys.sort(), (index, value) => {
                var link_path = path + value;

                var item = {
                  text: value,
                  href: "#!" + link_path
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
                   items[index]['nodes'] = value;
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
            return keys_tree.treeview('search', [ $('#input_search_tree').val(), { ignoreCase: true, exactMatch: false } ]);
        };
        var expandibleNodes = findExpandibleNodess();
        // Expand/collapse/toggle nodes
        $('#input_search_tree').on('keyup', function (e) {
            expandibleNodes = findExpandibleNodess();
            $('.expand-node').prop('disabled', !(expandibleNodes.length >= 1));
        });
    });
}

function update_breadcrumb() {
    path = get_path() || DEFAULT_SECRET_PATH;
    $("#create_secret_path").html(path);
    var path = path.substring(1);
    if (path.indexOf("&")>0){
        var params= path.split("&")
        path = params[0];
    }
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
        path = get_path();
        if (path.indexOf("&")>0){
            var params= path.split("&")
            path = params[0];
        }
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

    if (path.substring(path.length-1) == "/"){
        browse_secrets(path);
    } else if (path.length > 0) {
        $("#editormd").empty().removeAttr('class').css('height', 'auto');
        $("#editormd").append('<textarea style="display:none">');
        make_action("GET",path).done(function(response, textStatus, jqXHR){
            $("#editors").slideDown(EFFECT_TIME_EDITORS);
            $("#editormd textarea").text(response.data["data"]);

            if (response.data["username"]){
                edit = false;
                $("#log_info").html("Secret is locked by " + response.data["username"]).slideDown();
                $("#edit_secret_btn, #move_secret_btn, #delete_secret_btn").hide();
                $("#unlock_secret_btn").show();
            } else {
                // make sure that the buttons aren't hidden
                $("#edit_secret_btn, #move_secret_btn, #delete_secret_btn").show();
                $("#unlock_secret_btn").hide();
            }

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
                            "h1", "h2", "h3", "h4", "h5", "h6", "|",
                            "list-ul", "list-ol", "hr", "|",
                            "link", "reference-link", "image", "code",
                            "code-block",
                            "table", "emoji", "pagebreak", "|",
                            "watch", "preview", "search", "fullscreen"
                        ]
                    },
                    onload : function() {
                        set_secret("locked",editormarkdown.getMarkdown(),false,false,localStorage.getItem("ironvault_username"));
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
                            window.location.href = "#!"+path;
                            update_secret_tree();
                        });
                        $("#editor_update_secret_btn").click(function(){
                            set_secret("updated",editormarkdown.getMarkdown(),false,true,localStorage.getItem("ironvault_username"));
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
    }
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
    });
}

function browse_secrets(path){
    $("#editors").slideUp(EFFECT_TIME_EDITORS);
    $("#create_secret").show();
    $("#editormd").empty();
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

function hash_changed(){
    get_secret();
    reset_timer();
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
