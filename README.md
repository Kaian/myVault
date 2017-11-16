# MyVault

MyVault is a very basic web interface to browse secrets from a remote [HashiCorp's Vault](https://www.vaultproject.io/)

It's written in static HTML and Javascript using [Jquery](https://jquery.com/)

There's no intention to add features to configure Vault backend. But will see... 

**my Vault** has been created for using in a custom scenario, so maybe it will not fit into your needs. But of course, you can clone this project and modify for your needs if you want, or you can tell me to modify it if you want new features

## Features
* Browse all the secrets (depends on your permissions)
* View them
* Edit secrets with a fully Markdown editor (using [Editor.md](https://github.com/pandao/editor.md))
* Save modifications
* Print secrets
* Automatic logout for security reasons
* Automatic backup every time a secret is changed

There will be more features in future... or not.

## Dependencies
To use MyVault you will need a fully functional [Vault](https://www.vaultproject.io/) with LDAP authentication. You could login with Token too.

Take a look to the file [VAULT_config.md](VAULT_config.md) to see how should be Vault configured for using with myVault.

## Demo
You can see a demo in the static web pages of Github in this link [https://yuki.github.io/myVault/](https://yuki.github.io/myVault/)

You must click on the **gear icon** to introduce your Vault server. Be sure that you have read [VAULT_config.md](VAULT_config.md).

## How to use it
You can see in [demo](https://yuki.github.io/myVault/) link. If you want to checkout in your local machine, clone the project and get the submodule for the editor:

```
git clone https://github.com/yuki/myVault.git
cd myVault
git submodule update --init deps/editor.md
python2.7 -m SimpleHTTPServer 8000
```

Then, in your browser, go to http://localhost:8000

> This is just for developing or to check it out. You should put the code behind a real web server and a **SSL certificate**

### Configuration
There's a gear icon to make some configurations. Read [VAULT_config.md](VAULT_config.md) to see how your Vault server should be configured.

Edit "Vault server URL" to introduce the URL of your Vault server, for example: https://my-vault.example.com:8200/v1/ If you don't configure it, by default **myVault** will try to connect to http://127.0.0.1:8200/v1/ .

You should put myVault behind a real web server (nginx, apache...) with a **SSL certificate**.
