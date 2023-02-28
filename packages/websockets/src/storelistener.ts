import {
  EventStoreActioned,
  EventStoreDeleted,
  EventStorePartialUpdated,
  EventStorePatchUpdated,
  EventStoreUpdated,
  Store,
} from "@webda/core";
import { WSService } from "./service";

export class StoreListener {
  listeners: { [key: string]: (...any) => void } = {
    "Store.Actioned": (evt: EventStoreActioned) => {
      this.wsclient.log("INFO", [...this.uuids.values()], evt.object.getUuid());
      // If the object is not watched
      if (!evt.object || !this.uuids.has(evt.object.getUuid())) {
        return;
      }
      this.wsclient.sendModelEvent(evt.object.getFullUuid(), {
        type: "Actioned",
        model: evt.object,
        action: evt.action,
      });
    },
    "Store.Updated": (evt: EventStoreUpdated) => {
      // If the object is not watched
      if (!evt.object || !this.uuids.has(evt.object.getUuid())) {
        return;
      }
      this.wsclient.sendModelEvent(evt.object.getFullUuid(), {
        type: "Updated",
        model: evt.object,
      });
    },
    "Store.Deleted": (evt: EventStoreDeleted) => {
      // If the object is not watched
      if (!evt.object || !this.uuids.has(evt.object.getUuid())) {
        return;
      }
      this.wsclient.sendModelEvent(evt.object.getFullUuid(), {
        type: "Deleted",
      });
    },
    "Store.PatchUpdated": (evt: EventStorePatchUpdated) => {
      // If the object is not watched
      if (!evt.object || !this.uuids.has(evt.object.getUuid())) {
        return;
      }
      this.wsclient.sendModelEvent(evt.object.getFullUuid(), {
        model: evt.object,
        type: "PatchUpdated",
      });
    },
    "Store.PartialUpdated": (evt: EventStorePartialUpdated) => {
      // If the object is not watched
      if (!evt.object_id || !this.uuids.has(evt.object_id)) {
        return;
      }
      this.wsclient.sendModelEvent(evt.store.getName() + "$" + evt.object_id, {
        type: "PartialUpdated",
        partial_update: evt.partial_update,
      });
    },
  };

  constructor(private store: Store, private wsclient: WSService) {
    wsclient.log("DEBUG", "Add store listeners", store.getName());
    for (let evt in this.listeners) {
      store.on(<any>evt, this.listeners[evt]);
    }
  }

  uuids: Set<string> = new Set<string>();

  /**
   * Register a uuid with the listener
   * @param uuid
   */
  register(uuid: string) {
    this.wsclient.log(
      "DEBUG",
      `WSStoreListener: register ${this.store.getName()}$${uuid}`
    );
    this.uuids.add(uuid);
  }

  /**
   * Return true if the StoreListener can be deleted
   * @param uuid
   * @returns
   */
  unregister(uuid: string): boolean {
    this.wsclient.log(
      "DEBUG",
      `WSStoreListener: unregister ${this.store.getName()}$${uuid}`
    );
    this.uuids.delete(uuid);
    if (this.uuids.size === 0) {
      this.wsclient.log(
        "DEBUG",
        `WSStoreListener: remove listener to store ${this.store.getName()}`
      );
      for (let evt in this.listeners) {
        this.store.removeListener(<any>evt, this.listeners[evt]);
      }
      return true;
    }
    return false;
  }
}
