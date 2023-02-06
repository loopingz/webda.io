import { DeepPartial } from "@webda/core";
import { io, Socket } from "socket.io-client";
import { WebSocketsParameters, WSService } from "./service";

export class WebSocketsClientParameters extends WebSocketsParameters {
  /**
   * Make frontend mandatory for client
   */
  frontend: string;
}
/**
 * Manage a websocket client
 *
 * The Store listener logic is implemented in the abstract class WSService
 *
 * @WebdaModda
 */
export class WebSocketsClientService<
  T extends WebSocketsClientParameters = WebSocketsClientParameters
> extends WSService<T> {
  socket: Socket;

  /**
   * Forward to the frontend servers
   * @param args
   */
  async _sendModelEvent(...args) {
    this.socket.emit("backend-event", ...args);
  }

  /**
   * @override
   */
  loadParameters(params: DeepPartial<T>): WebSocketsClientParameters {
    return new WebSocketsClientParameters(params);
  }

  /**
   * Connect to the frontend
   * @returns
   */
  async init() {
    this.socket = io(this.parameters.frontend, {
      extraHeaders: {
        "X-Webda-WS": await this.getAuthToken()
      }
    });
    /**
     * Get the list of all rooms on connection
     */
    this.socket.on("registered", ({ rooms }) => {
      rooms.forEach(c => this.registerRoom(c));
    });
    /**
     * New room created
     */
    this.socket.on("create-room", room => {
      this.log("DEBUG", "Adding channel", room);
      this.registerRoom(room);
    });
    /**
     * Delete room
     */
    this.socket.on("delete-room", room => {
      this.log("DEBUG", "Deleting channel", room);
      this.unregisterRoom(room);
    });
    return super.init();
  }
}
