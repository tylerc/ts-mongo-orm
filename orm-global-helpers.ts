import * as Joi from "@hapi/joi";
import {MongoClient, MongoClientOptions} from "mongodb";
import {OrmDocumentClass} from "./orm-decorators";

export class OrmGlobalHelpers {
  static Models = new Set<OrmDocumentClass>();
  static Validators = new Map<OrmDocumentClass, Joi.SchemaMap>();
  static Fields = new Map<OrmDocumentClass, string[]>();

  static DatabaseConnections = new Map<string, MongoClient>();
  static DatabaseConnectionCallbacks = new Map<string, (() => any)[]>();

  static async DatabaseConnectDefault(uri: string = "mongodb://localhost:27017/test", options?: MongoClientOptions): Promise<any> {
    return OrmGlobalHelpers.DatabaseConnect("default", uri, options);
  }

  static async DatabaseConnect(name: string, uri: string, options?: MongoClientOptions): Promise<any> {
    if (!options) {
      options = {useNewUrlParser: true};
    }

    let client = new MongoClient(uri, options);
    OrmGlobalHelpers.DatabaseConnections.set(name, client);
    await client.connect();

    let callbacks = OrmGlobalHelpers.DatabaseConnectionCallbacks.get(name);
    if (callbacks) {
      callbacks.forEach(c => c());
    }
  }

  static async DatabaseConnectionsClose(): Promise<any> {
    for (let [_, client] of this.DatabaseConnections) {
      await new Promise(resolve => client.close(resolve));
    }
  }

  static CallWhenConnected(databaseConnectionName: string, func: () => any) {
    let connection = OrmGlobalHelpers.DatabaseConnections.get(databaseConnectionName);
    if (connection && connection.isConnected()) {
      func();
    } else {
      let arr = OrmGlobalHelpers.DatabaseConnectionCallbacks.get(databaseConnectionName);
      if (arr) {
        arr.push(func);
      } else {
        OrmGlobalHelpers.DatabaseConnectionCallbacks.set(databaseConnectionName, [func]);
      }
    }
  }
}
