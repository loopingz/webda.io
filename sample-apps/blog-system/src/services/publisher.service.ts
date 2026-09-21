import { Operation, Service, useLog } from "@webda/core";

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
    useLog("INFO", "Publishing post with ID:", postId);
    return { postId, status: "published" };
  }
}
