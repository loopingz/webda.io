import { Service, ServiceContext, Route, Inject, OperationContext } from '@webda/core';
import { User } from '../models/User';
import { Email } from '../models/Email';
import { Folder } from '../models/Folder';
import { MemoryStore } from '@webda/core'; // Assuming MemoryStore is used for direct access if needed

// A simple interface for our send email payload
interface ISendEmailPayload {
  fromUserId: string;
  toUserEmail: string; // For simplicity, we'll find the recipient by email
  subject: string;
  body: string;
}

export class MailService extends Service {
  @Inject('users') // Inject the 'users' store
  usersStore: MemoryStore<User>;

  @Inject('emails') // Inject the 'emails' store
  emailsStore: MemoryStore<Email>;

  @Inject('folders') // Inject the 'folders' store
  foldersStore: MemoryStore<Folder>;

  // Helper to find or create a folder
  private async findOrCreateFolder(userId: string, folderName: string): Promise<Folder> {
    let folder = await this.foldersStore.findOne({ userId, name: folderName });
    if (!folder) {
      // Folder names should ideally be constants or an enum
      const newFolderData: Partial<Folder> = { name: folderName, userId };
      folder = await this.foldersStore.create(newFolderData as Folder);
    }
    return folder;
  }

  @Route('/sendEmail', ['POST'])
  async sendEmailRoute(ctx: ServiceContext<ISendEmailPayload>) {
    const { fromUserId, toUserEmail, subject, body } = ctx.payload;

    if (!fromUserId || !toUserEmail || !subject || !body) {
      ctx.throw(400, 'Missing required fields for sending email.');
      return;
    }

    const fromUser = await this.usersStore.findById(fromUserId);
    if (!fromUser) {
      ctx.throw(404, `Sender user with ID ${fromUserId} not found.`);
      return;
    }

    const toUser = await this.usersStore.findOne({ email: toUserEmail });
    if (!toUser) {
      ctx.throw(404, `Recipient user with email ${toUserEmail} not found.`);
      return;
    }

    // 1. Get/Create Sent folder for sender
    const sentFolder = await this.findOrCreateFolder(fromUser.uuid, 'Sent');

    // 2. Get/Create Inbox folder for recipient
    const inboxFolder = await this.findOrCreateFolder(toUser.uuid, 'Inbox');

    // 3. Create Email record for sender (in Sent folder)
    const sentEmailData: Partial<Email> = {
      subject,
      body,
      from: fromUser.email,
      to: [toUser.email],
      timestamp: new Date(),
      read: true, // Sender's copy is read
      userId: fromUser.uuid,
      folderId: sentFolder.uuid,
    };
    const sentEmail = await this.emailsStore.create(sentEmailData as Email);

    // 4. Create Email record for recipient (in Inbox folder)
    const receivedEmailData: Partial<Email> = {
      subject,
      body,
      from: fromUser.email,
      to: [toUser.email],
      timestamp: new Date(),
      read: false, // Recipient's copy is unread
      userId: toUser.uuid,
      folderId: inboxFolder.uuid,
    };
    await this.emailsStore.create(receivedEmailData as Email);

    ctx.send({ message: 'Email sent successfully!', sentEmailId: sentEmail.uuid });
  }

  async canAct(_ctx: OperationContext<any, any>, _action: string): Promise<string | boolean> {
    return true; // Keep it simple
  }
}
