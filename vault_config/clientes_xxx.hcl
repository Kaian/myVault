path "/sys/policy/admins" {
  capabilities = ["read"]
}

path "/sys/capabilities" {
 capabilities = ["update"]
}

path "secret/clientes/xxx/*" {
  capabilities = ["list","read"]
}

path "backup/secret/clientes/xxx/*" {
  capabilities = ["list","read"]
}