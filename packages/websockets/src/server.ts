import { Context, Counter, Gauge, RequestFilter, Store } from "@webda/core";
import { Server, Socket } from "socket.io";
import { WebSocketsParameters, WSService } from "./service";


/**
 * @WebdaModda
 */
export class WebSocketsService<T extends WebSocketsParameters = WebSocketsParameters> extends WSService<T> implements RequestFilter {
  /**
   * Send to the model channel
   * @param fullUuid
   * @param type
   * @param evt
   */
  async _sendModelEvent(fullUuid: string, type: string, ...evt: any): Promise<void> {
    this.io.to(`model_${fullUuid}`).emit(type, ...evt);
  }

  metrics: {
    connections: Gauge;
    messages: Counter;
  };

  async checkRequest(context: Context<any, any>): Promise<boolean> {
    return context.getHttpContext().getRelativeUri().startsWith("/socket.io/");
  }

  io: Server;

  /**
   * Call an Operation from the websocket
   * @param operation 
   * @param socket 
   * @param context 
   */
  async onOperation(operation: { id: string; input?: any }, socket: Socket, context: Context) {
    try {
      socket.emit("operation", {
        status: "SUCCESS",
        result: await this.getWebda().callOperation(context, operation.id)
      });
    } catch (err) {
      socket.emit("operation", {
        status: "ERROR"
      });
    }
  }

  /**
   * Subscribe to a model
   * @param fullUuid 
   * @param socket 
   * @param context 
   * @param method 
   */
  async onSubscribe(fullUuid: string, socket: Socket, context: Context, method: "leave" | "join" = "join") {
    const result = (method === "leave" ? "un" : "") + "subscribed";
    this.log("INFO", (await this.getService<Store>("Registry").get("test")).getFullUuid(), fullUuid);
    try {
      this.log("INFO", "Subscribing to", fullUuid);
      let model = await this.getWebda().getModelObject(fullUuid);
      if (!model) {
        throw new Error("Not found");
      }
      await model.canAct(context, "subscribe");

      const store = model.getStore();
      const storeName = store.getName();
      this.log("INFO", "Check for ", storeName);
      await socket[method](`model_${fullUuid}`);
      socket.emit(result, {
        status: "SUCCESS",
        uuid: fullUuid
      });
    } catch (err) {
      this.log("ERROR", "Error", err);
      socket.emit(result, {
        status: "ERROR",
        error: "NOT_ALLOWED",
        uuid: fullUuid
      });
    }
  }

  /**
   * @override
   */
  initMetrics(): void {
    super.initMetrics();
    this.log("INFO", "init metrics");
    this.metrics.connections = this.getMetric(Gauge, { name: "ws_connections", help: "Number of active connections" });
    this.metrics.messages = this.getMetric(Counter, {
      name: "ws_messages",
      help: "Number of messages sent",
      labelNames: ["type"]
    });
  }

  /**
   * Return list of the current model rooms
   * @returns 
   */
  getRooms() {
    return [...this.io.sockets.adapter.rooms.keys()].filter(c => c.startsWith("model_"));
  }

  /**
   * @override
   */
  resolve(): this {
    this.getWebda().registerRequestFilter(this);
    this.getWebda().on("Webda.Init.SocketIO", async evt => {
      this.io = <Server>evt;
      this.io.of("/").adapter.on("create-room", room => {
        if (room.startsWith("model_")) {
          this.io.to("backend").emit("create-room", room);
          this.registerRoom(room);
        }
      });
      this.io.of("/").adapter.on("delete-room", room => {
        if (room.startsWith("model_")) {
          this.io.to("backend").emit("delete-room", room);
          this.unregisterRoom(room);
        }
      });
      // On connection
      this.io.on("connection", async socket => {
        this.metrics.connections.inc();
        let context = <Context>(<any>socket.request).webdaContext;
        let authToken = <string>context.getHttpContext().getHeader("x-webda-ws");
        if (authToken) {
          if (!await this.verifyAuthToken(authToken)) {
            socket.disconnect();
          }
          // Verify some stuff here
          socket.join("backend");
          socket.emit("registered", {
            rooms: this.getRooms()
          });
          socket.on("backend-event", (fullUuid, type, ...args) => {
            this.log("INFO", "Received backend event");
            this.io.to(`model_${fullUuid}`).emit(type, ...args);
          });
        }
        // Does not allow anonymous
        else if (!context.getCurrentUserId()) {
          this.log("INFO", "WebSocket client without authorization");
          socket.disconnect();
          return;
        }

        // Subscribe to a model event
        socket.on("subscribe", (fullUuid: string) => {
          this.metrics.messages.inc({ type: "subscribe" });
          this.onSubscribe(fullUuid, socket, context, "join");
        });
        socket.on("unsubscribe", (fullUuid: string) => {
          this.metrics.messages.inc({ type: "unsubscribe" });
          this.onSubscribe(fullUuid, socket, context, "leave");
        });
        socket.on("uievent", (fullUuid: string, ...evt: any) => {});
        // Call an operation
        socket.on("operation", async (operation, input) => {
          this.metrics.messages.inc({ type: "operation" });
          this.onOperation(operation, socket, context);
        });

        socket.on("disconnect", async () => {
          this.log("INFO", "Socket closed");
          this.metrics.connections.dec();
        });
        socket.on("error", async () => {
          this.log("ERROR", "Socket closed");
          this.metrics.connections.dec();
        });
      });
    });
    return super.resolve();
  }
}
