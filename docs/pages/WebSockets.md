# WebSockets

The Node HTTP Handler does handle websockets.
If you launch webda with `webda serve -w` it will enable the WebSockets for you.

It leverages `socket.io` and will emit a `Webda.Init.SocketIO` event with the socket.io object

```
import { Service, Bean } from "@webda/core";
import { Server } from "socket.io";

@Bean
class QuizzService extends Service {
  resolve() {
    super.resolve();
    this.log("INFO", "Adding SocketIO listener");
    this.getWebda().on("Webda.Init.SocketIO", (evt) => {
      const io = <Server>evt;
      io.on("connection", () => {
          
      });
    });
    return this;
  }
}
```