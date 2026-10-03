import { Operation, Service, setOperationSubject, useLog } from "@webda/core";
import { Post } from "../models/Post.model.js";

export class PublisherParameters extends Service.Parameters {}

/**
 * @WebdaModda
 */
export class Publisher<T extends PublisherParameters = PublisherParameters> extends Service<T> {
  static Parameters = PublisherParameters;

  @Operation()
  publish(message: string): string {
    useLog("INFO", "Publishing message:", message);
    return "customid";
  }

  @Operation()
  async publishPost(postId: string): Promise<{ postId: string; status: string }> {
    // A service operation: tell the audit log which post it acts on
    setOperationSubject({ model: Post, key: postId });
    useLog("INFO", "Publishing post with ID:", postId);
    return { postId, status: "published" };
  }
}
