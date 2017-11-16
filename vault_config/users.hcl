path "/sys/policy/users" {
  capabilities = ["read"]
}

path "/sys/capabilities" {
 capabilities = ["update"]
}

path "secret/*" {
  capabilities = ["create","read", "update", "list"]
}

path "backup/*" {
  capabilities = ["create", "read", "list"]
}