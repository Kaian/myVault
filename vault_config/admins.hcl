path "/sys/policy/admins" {
  capabilities = ["read"]
}

path "/sys/capabilities" {
 capabilities = ["update"]
}

path "secret/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}

path "backup/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}