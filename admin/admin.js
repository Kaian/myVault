var preferences = {};

function delete_secret_backups() {
    var promises = [];
    var nodes = $("#tree").treeview("getChecked");
    $.each(nodes, (index, value) => {
        console.log(value.href);
        if (value.href.substring(value.href.length - 1) != "/") {
            promises.push(make_action("DELETE",value.href.substring(2)));
        }
        // we don't allow to remove backups from a directory recursively, 
    });
    Promise.all(promises).then(data => {
        $("#log_success").html("Selected backups have been removed").slideDown().delay(EFFECT_TIME).slideUp();
        update_secret_tree(preferences.backup_path,true);
    });
}
