# Vault configurations
This file tries to explain how to config [Vault](https://www.vaultproject.io/) for using with **myVault**.


## LDAP authentication
**myVault** has been created for using against LDAP authentication. For that, you should do something like this in your Vault server:

```
vault auth-enable ldap

vault write auth/ldap/config url="ldap://192.168.1.10" userdn="ou=users,dc=example,dc=com" discoverdn=true userattr="cn" groupdn="ou=groups,dc=example,dc=com"
```

This is a very general configuration. You should configure your LDAP for using SSL certificate and protocol "ldaps", so all the communication between Vault and LDAP goes encrypted


### Groups
There should be three different groups:
* **admins**: Where will be admin users
* **users**: normal users
* **clients**: There should be as much "client" groups as we need. The name should look like "clientes_XXX", "clientes_YYY".

See Vault policies in this page to see how to configure them in Vault.


## Vault secret paths
**myVault** expects to have two paths for secrets:
* **/secret/**: for storing secrets
* **/backup/**: for storing the backups when secrets are edited. The backups will have the next path: /backup/PATH_ORIGINAL_SECRET/secret__EPOCHTIME

Those paths can be configured in **myVault** (gear icon).


## Vault policies
**myVault** uses policies and its capabilities to see what a user can do. Because of this, all user's policies should have access to **read** it's policy and the path **/sys/capabilities** :

```
path "/sys/policy/POLICY_NAME" {
  capabilities = ["read"]
}

path "/sys/capabilities" {
 capabilities = ["update"]
}
```

We expect three kind of users.

### admins
Admin users, who can do everything inside **myVault** to edit/move/delete secrets and backups. See **[vault_config/admins.hcl](vault_config/admins.hcl)**

To add this policy:

```
vault policy-write admins admins.hcl
```


### users with privileges
Normal users. Could create new secrets and backups, but not delete any of them. See **[vault_config/users.hcl](vault_config/users.hcl)**

```
vault policy-write users users.hcl
```


### clients/limited users
Limited users. The idea is to let clients to see secrets that could belongs to them. 

**myVault** is configured to expect this policies to be named as "cliente_XXX", and with this, its default path will be: **/secret/clientes/XXX/**

A "client" user can see the secrets within its path, and the backups, but cannot edit or delete them.

See **[vault_config/clientes_xxx.hcl](vault_config/clientes_xxx.hcl)** as example.

To add a "cliente" as example:

```
vault policy-write clientes_xxx clientes_xxx.hcl
```


## Web server (Nginx)
We are going to use Nginx as a web server, and this will make as a proxy to bypass connections to Vault, that is in the same server. So the default URL should be **https://vault.example.com** 

**myVault** must be downloaded in **/usr/share/nginx/html/**

```
upstream backend {
        server 192.168.1.9:8200;
}
server {
    listen       443 ssl;
    server_name  vault.example.com;
    ssl on;

    location / {
        root   /usr/share/nginx/html;
        index  index.html index.htm;
    }

    ssl_verify_client off;
    
    location /v1/ {
        proxy_pass https://backend;
    }

    ssl_certificate    /etc/vault/ssl/vault.crt;
    ssl_certificate_key    /etc/vault/ssl/vault.key;

    error_page   500 502 503 504  /50x.html;
    location = /50x.html {
        root   /usr/share/nginx/html;
    }
}
```


### Enabling CORS
If your web server that has **myVault** and Vault aren't in the same server, you should enable CORS on Vault:

```
curl -k -X PUT -H "X-Vault-Token: ROOT_TOKEN" -d '{"enabled": true,"allowed_origins": "*"}' https://192.168.1.9:8200/v1/sys/config/cors
```