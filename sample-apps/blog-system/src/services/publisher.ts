import { Operation, Service } from "@webda/core";
import { Post } from "../models/Post";
import { PrimaryKeyType } from "@webda/models";

class PublisherParameters extends Service.Parameters {}

export class Publisher<T extends PublisherParameters = PublisherParameters> extends Service<T> {
  static Parameters = PublisherParameters;

  @Operation()
  publish(message: string): string {
    console.log("Publishing message:", message);
    return "customid";
  }

  @Operation()
  async publishPost(postId: PrimaryKeyType<Post>): Promise<{
    postId: PrimaryKeyType<Post>;
    status: string;
  }> {
    console.log("Publishing post with ID:", postId);
    return {
      postId,
      status: "published"
    };
  }
}
