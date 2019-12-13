import { ChangeStream, Db, ObjectId } from "mongodb";
import { EventEmitter } from "events";

import {
  ChangeEvent,
  DeleteEvent,
  InsertEvent,
  ReplaceEvent,
  UpdateEvent
} from "./events";

interface Subscription {
  action(_id: ObjectId, event: ChangeEvent): Promise<any>;
  collection: string;
  paths: string[];
  type: string;
}

function matchProps(sProps: string[], wProps: string[]) {
  for (let i = 0; i < sProps.length && i < wProps.length; i++) {
    const sProp = sProps[i];
    const wProp = wProps[i];
    if (sProp !== wProp && wProp !== "*") {
      return false;
    }
  }
  return true;
}

function matchAnyPath(sPath: string, wPaths: string[]) {
  const sProps = sPath.split(".");
  for (const wPath of wPaths) {
    const wProps = wPath.split(".");
    if (matchProps(sProps, wProps)) {
      return true;
    }
  }
  return false;
}

function matchUpdateEvent(event: UpdateEvent, wPaths: string[]) {
  for (const sPath in event.updateDescription.updatedFields) {
    if (matchAnyPath(sPath, wPaths)) {
      return true;
    }
  }
  for (const sPath of event.updateDescription.removedFields) {
    if (matchAnyPath(sPath, wPaths)) {
      return true;
    }
  }
  return false;
}

export class Stalker extends EventEmitter {
  private db: Db;

  private collections: string[];

  private executing: boolean;

  private queue: ChangeEvent[];

  private streams: ChangeStream[];

  private subscriptions: Subscription[];

  constructor(db: Db) {
    super();
    this.db = db;
    this.collections = [];
    this.executing = false;
    this.queue = [];
    this.streams = [];
    this.subscriptions = [];
  }

  public create(
    collection: string,
    action: (_id: ObjectId, event: InsertEvent) => Promise<any>
  ) {
    this.subscribe("insert", collection, [], action);
  }

  public update(
    collection: string,
    paths: string[],
    action: (_id: ObjectId, event: UpdateEvent | ReplaceEvent) => Promise<any>
  ) {
    this.subscribe("update", collection, paths, action);
  }

  public delete(
    collection: string,
    action: (_id: ObjectId, event: DeleteEvent) => Promise<any>
  ) {
    this.subscribe("delete", collection, [], action);
  }

  public insert(
    collection: string,
    action: (_id: ObjectId, event: InsertEvent) => Promise<any>
  ) {
    this.create(collection, action);
  }

  public start() {
    // Create and save the required change streams
    for (const collection of this.collections) {
      const stream = this.db.collection(collection).watch();
      stream.on("change", (event: ChangeEvent) => {
        this.queue.push(event);
        if (!this.executing) {
          this.run();
        }
      });
      this.streams.push(stream);
    }

    // Emit event
    this.emit("start");
  }

  public async stop(flush?: boolean) {
    // Close all streams
    while (this.streams.length > 0) {
      const stream = this.streams.pop();
      if (stream) {
        await stream.close();
      }
    }

    // Wait for queued actions
    if (this.executing) {
      if (flush === false) {
        this.queue = [];
      }
      await new Promise(resolve => this.once("end", resolve));
    }

    // Emit event
    this.emit("stop");
  }

  private subscribe(
    type: string,
    collection: string,
    paths: string[],
    action: (_id: ObjectId, event: any) => Promise<any>
  ) {
    if (!this.collections.includes(collection)) {
      this.collections.push(collection);
    }
    this.subscriptions.push({
      action,
      collection,
      paths,
      type
    });
  }

  private async run() {
    // Set executing flag
    this.executing = true;

    // Extract the first element from the queue
    const event = this.queue.shift();

    // Nothing else to process
    if (!event) {
      this.executing = false;
      process.nextTick(() => this.emit("end"));
      return;
    }

    // Ignore useless events
    if (
      event.operationType === "drop" ||
      event.operationType === "dropDatabase" ||
      event.operationType === "invalidate" ||
      event.operationType === "rename"
    ) {
      process.nextTick(() => this.run());
      return;
    }

    // Get correct subscriptions
    const subscriptions = this.subscriptions.filter(sub => {
      if (sub.collection !== event.ns.coll) {
        return false;
      }

      if (
        sub.type !== event.operationType &&
        (sub.type !== "update" || event.operationType !== "replace")
      ) {
        return false;
      }

      if (event.operationType === "update") {
        return matchUpdateEvent(event, sub.paths);
      } else {
        return true;
      }
    });

    // Process subscriptions
    for (const sub of subscriptions) {
      try {
        await sub.action(event.documentKey._id, event);
      } catch (err) {
        this.emit("error", err, event);
      }
    }

    // Process next event
    process.nextTick(() => this.run());
  }
}
