import { ObjectId } from 'mongodb'

export interface Event {
  _id: any
  clusterTime: any
}

export interface InsertEvent extends Event {
  operationType: 'insert'
  fullDocument: any
  ns: {
    db: string
    coll: string
  }
  documentKey: {
    _id: ObjectId
  }
}

export interface UpdateEvent extends Event {
  operationType: 'update'
  ns: {
    db: string
    coll: string
  }
  documentKey: {
    _id: ObjectId
  }
  updateDescription: {
    updatedFields: {
      [field: string]: any
    }
    removedFields: string[]
  }
}

export interface ReplaceEvent extends Event {
  operationType: 'replace'
  fullDocument: any
  ns: {
    db: string
    coll: string
  }
  documentKey: {
    _id: ObjectId
  }
}

export interface DeleteEvent extends Event {
  operationType: 'delete'
  ns: {
    db: string
    coll: string
  }
  documentKey: {
    _id: ObjectId
  }
}

export interface DropEvent extends Event {
  operationType: 'drop'
  ns: {
    db: string
    coll: string
  }
}

export interface RenameEvent extends Event {
  operationType: 'rename'
  ns: {
    db: string
    coll: string
  }
  to: {
    db: string
    coll: string
  }
}

export interface DropDatabaseEvent extends Event {
  operationType: 'dropDatabase'
  ns: {
    db: string
  }
}

export interface InvalidateEvent extends Event {
  operationType: 'invalidate'
}

export type ChangeEvent =
  | InsertEvent
  | UpdateEvent
  | ReplaceEvent
  | DeleteEvent
  | DropEvent
  | RenameEvent
  | DropDatabaseEvent
  | InvalidateEvent
