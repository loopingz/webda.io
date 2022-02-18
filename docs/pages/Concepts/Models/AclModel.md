# Acl Model

This implement a basic Acl Model system

It expose two new route if model is exposed via Store:

- GET /store/{uuid}/acl
- PUT /store/{uuid}/acl


A phantom attribute `_permissions` is added on when the model is retrieved via GET