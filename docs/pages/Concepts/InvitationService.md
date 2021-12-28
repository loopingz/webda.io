# Invitation Service

The invitation service implement a workflow to invite users by their idents on an object.

The invitation can be pending if the user is not registered or if `autoAccept` is false.

Example:

With a Company CoreModel

You can invite a user by ident into the company.
You will find in `attribute` the accepted invitations on both Company and User model
You will find in `pendingAttribute` the pending invitations on both Company and User model.

If `multiple` is false, then on the User the `attribute` is a single instance of `Partial<Company>` otherwise it will be a map `{[key: string}: Partial<Company>}`
The `pendingAttribute` is always a `{[key: string}: Partial<Company>}` as you can be invited to several Company and pick and choose regardless if you can have several company or not.
When `multiple` is false any new accept will lead to replacement of the attribute.
You cannot define `autoAccept` if multiple is false



An invitation can be done with either ident or user.

Pending invitations contains unaccepted invitation or invitation to a non-registered idents
