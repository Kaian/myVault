// global variables
// TOOD: this should be made in better way :-)
var VAULT_URL = "http://127.0.0.1:8200/v1/";
var DEFAULT_SECRET_PATH = "/secret/";
var BACKUP_SECRET_PATH  = "/backup/";
var EFFECT_TIME= 200;
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
    var url = localStorage.getItem("ironvault_url") || VAULT_URL;
    var data = "";
    var header = "";
    var type = "POST";
    if (method == "ldap"){
        var username = document.getElementById("username").value;
        url = url+"auth/ldap/login/"+username
        var pass = document.getElementById("password").value;
        data = {password:pass};
    } else if (method == "token") {
        type = "GET";
        var token = document.getElementById("token").value;
        url = url+"auth/token/lookup-self";
        header = {"X-Vault-Token": token};
        data = {"token": "ClientToken"};
    }

    $.ajax({
        type: type,
        data :JSON.stringify(data),
        url: url,
        headers: header,
        contentType: "application/json",
        dataType: "json",
        statusCode: {
            400: function (response, textStatus, errorThrown) {
                $("#login_error").html(response.responseJSON.errors).slideDown().delay(3500).slideUp();
                // $("#login_error")
            }
        },
    }).done(function(res) {
        if (method == "ldap"){
            localStorage.setItem("ironvault_token", res.auth.client_token);
        } else if (method == "token"){
            localStorage.setItem("ironvault_token", res.data.id);
        }
        localStorage.setItem("ironvault_accessor", res.auth.accessor);
        localStorage.setItem("ironvault_username", res.auth.metadata.username);
        $("#login_modal").modal("hide");
        is_logged();
    }).fail(function(res, textStatus, errorThrown){
        if (res.readyState == 0){
            logout("There's a network error");
            $('#log_error').slideDown().delay(1500).slideUp();
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
        var token = get_token();
        localStorage.removeItem('ironvault_token');
        $("#login_modal").modal("show");
        $("#username").val("");
        $("#password").val("");
        $("#token").val("");
        $("#login_error").html(error).slideDown().delay(1500).slideUp();
        //revoke token
        $.ajax({
            type: "POST",
            headers: { "X-Vault-Token": token },
            url: VAULT_URL + "auth/token/revoke-self",
            contentType: "application/json",
            dataType: "json"
        });
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
}

function print_errors(){
    var errors = window.location.hash.substring(1);
    if (errors){
        $("#log_error").slideDown();
    }
    $('#log_error').html(errors);
}

function get_tree(path) {
    var token = get_token();

    var promise = new Promise((resolve, reject) => {
        $.ajax({
            type: "LIST",
            async: true,
            crossDomain: true,
            headers: { "X-Vault-Token": token },
            url: VAULT_URL + path.substring(1),
            contentType: "application/json",
            dataType: "json"
        }).always(function (response) {
            var promises = []
            var items = []

            $.each(response.data.keys.sort(), (index, value) => {
                var item = {
                  text: value,
                  href: "#!" + path + value
                };

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

function delete_vault_secret(path){
    var token = get_token();
    return $.ajax({
        type: "DELETE",
        headers: {"X-Vault-Token": token},
        url: VAULT_URL+path.substring(1)
    });
}

function get_vault_secret(path){
    var token = get_token();
    return $.ajax({
        type: "GET",
        headers: {"X-Vault-Token": token},
        url: VAULT_URL+path.substring(1),
        contentType: "application/json",
        dataType: "json",
    });
}

function set_vault_secret(path,data,backup=true){
    var token = get_token();
    var json_item = {};
    json_item["ironvault"] = "markdown";
    json_item["data"] = data;

    if (backup){
        backup_secret(path);
    }
    return $.ajax({
        type: "PUT",
        headers: {"X-Vault-Token": token},
        url: VAULT_URL+path.substring(1),
        contentType: "application/json",
        dataType: "json",
        data: JSON.stringify(json_item)
    });
}

function move_secret(path,new_path){
    get_vault_secret(path).done(function(response, textStatus, jqXHR){
        set_vault_secret(new_path,response.data["data"]).done(function(response, textStatus, jqXHR){
            $("#move_modal").modal("hide");
            $("#log_success").html("Secret has been moved to "+new_path).slideDown().delay(1500).slideUp();
            delete_vault_secret(path);
            window.location.href = "#!"+new_path;
        });
    });
}

function backup_secret(path){
    var date = (new Date).getTime();
    get_vault_secret(path).done(function(response, textStatus, jqXHR){
        set_vault_secret(BACKUP_SECRET_PATH+path.substring(1)+"__"+date,response.data["data"],false);
    });
}

function delete_secret(path){
    delete_vault_secret(path).done(function(response, textStatus, jqXHR){
        window.location.href = "#!"+DEFAULT_SECRET_PATH;
        $("#log_error").html("Secret has been deleted").slideDown().delay(1500).slideUp();
        $("#editors").hide();
        $("#create_secret").show();
    });
}

function set_secret(action,data,create){
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

    set_vault_secret(path,data).done(function(response, textStatus, jqXHR){
        switch(jqXHR.status) {
            case 204:
                    $("#log_success").html("Secret has been "+action).slideDown().delay(1500).slideUp();
                    if (create){
                        window.location.href = "#!"+path+"&edit=1";
                    }
                break;
            case 400:
                    $("#log_error").html("Secret has NOT been "+action+"<br/><br/>ERROR: "+errorThrown);
                    $("#log_error").slideDown().delay(2500).slideUp();
                break;
            case 403:
                    logout(textStatus+" "+errorThrown);
                break;
        }; //switch
    });
}

function get_secret(){
    var token = get_token();
    var path = get_path();
    var edit = false;
    $("#create_secret").hide();
    if (path.indexOf("&")>0){
        var params= path.split("&")
        path = params[0];
        if (params[1].split("=")[0] == "edit"){
            edit = true
        }
    }
    if (path.substring(path.length-1) == "/"){
        // we're in a directory
        browse_secrets(path);
    } else if (path.length > 0) {
        $("#editormd").empty().removeAttr('class').css('height', 'auto');
        $("#editormd").append('<textarea style="display:none">');
        get_vault_secret(path).done(function(response, textStatus, jqXHR){
            $("#editors").slideDown(EFFECT_TIME);
            update_breadcrumb();

            $("#editormd textarea").text(response.data["data"]);

            var editormarkdown = "";
            if (edit) {
                var editormarkdown = "";
                $("#functions_buttons").hide();

                editormarkdown = editormd({
                    id                 : "editormd",
                    width              : "100%",
                    path               : "deps/editor.md/lib/",
                    // height             : 800,
                    mode               : "gfm", // https://codemirror.net/mode/gfm/
                    tocm               :true,
                    codeFold           : true,
                    // saveHTMLToTextarea : true,
                    searchReplace      : true,
                    autoCloseTags      : true,
                    htmlDecode         : "style,script,iframe",
                    emoji              : true,
                    taskList           : true,
                    tex                : true,
                    flowChart          : true,
                    sequenceDiagram    : true,
                    toolbarAutoFixed   : false,
                    toolbarIcons : function(){
                        return ["undo", "redo", "|",
                            "bold", "del", "italic", "quote", "|",
                            "h1", "h2", "h3", "h4", "h5", "h6", "|",
                            "list-ul", "list-ol", "hr", "|",
                            "link", "reference-link", "image", "code",
                            "preformatted-text", "code-block",
                            "table", "emoji", "pagebreak", "|",
                            "watch", "preview", "search", "fullscreen"
                        ]
                    },
                    onload : function() {
                        // Awesome hack to add "save" option :D
                        $("ul.editormd-menu")
                            .prepend(
                                '<li><a href="javascript:;" id="editor_update_secret_btn" title="Save" unselectable="on">\
                                <i class="fa fa-floppy-o" unselectable="on"></i></a></li>');
                        $("#editor_update_secret_btn").click(function(){
                            set_secret("updated",editormarkdown.getMarkdown(),false);
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
            } else {
                $("#functions_buttons").show();
                // just show the secret
                editormarkdown = editormd.markdownToHTML("editormd", {
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
                });
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
            switch (jqXHR.status){
                case 403:
                        logout(textStatus+" "+errorThrown);
                    break;
                case 404:
                        $('#log_error').html("Secret not found").slideDown().delay(2500).slideUp();
                        $("#editors").slideUp(EFFECT_TIME);
                    break;
            }
        });
    }
}

function browse_secrets(path){
    var token = get_token();
    var path_array = [];
    $("#editors").slideUp(EFFECT_TIME);
    $("#create_secret").show();
    $("#editormd").empty();
    $.ajax({
        type: "LIST",
        headers: {"X-Vault-Token": token},
        timeout: 1000,
        url: VAULT_URL+path.substring(1),
        contentType: "application/json",
        dataType: "json",
        timeout: 5000,
        statusCode: {
            200: function (response, textStatus, errorThrown) {
                update_breadcrumb();
            },
            403: function (response, textStatus, errorThrown){
                logout(textStatus+" "+errorThrown);
            },
            404: function (response, textStatus, errorThrown) {
                $('#log_error').html("Path not found").slideDown().delay(2500).slideUp();
            }
         },
    }).fail(function(res, textStatus, errorThrown){
        if (res.readyState == 0){
            logout("There's a network error");
        }
    });
}

function hash_changed(){
    var hash = location.hash.replace( /^#/, '' );
    get_secret(hash);
    reset_timer();
}

$(document).ready(function(){
    // login.html
    $("#login").click(function(){
        login();
    });

    $("#logout").click(function(){
        logout("You have been logout");
    });

    // index.html
    $("#create_secret_btn").click(function(){
        set_secret("created","",true);
    });

    $("#edit_secret_btn").click(function(){
        var path = get_path();
        window.location.href = "#!"+path+"&edit=1";
    });

    $("#print_secret_btn").click(function(){
        print_secret($("#editormd").html());
    });

    window.addEventListener("hashchange", hash_changed, false);

    is_logged();

});
