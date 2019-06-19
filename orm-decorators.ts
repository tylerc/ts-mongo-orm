import * as Joi from "@hapi/joi";
import {OrmGlobalHelpers} from "./orm-global-helpers";
import {ObjectId} from "bson";

export type OrmDocumentClass = {
  new(...args: any[]): { _id: any };
  databaseName: string;
  collectionName: string;
};

export type OrmDocumentInstance = InstanceType<OrmDocumentClass>;

export function Document<T extends OrmDocumentClass>(classConstructor: T) {
  OrmGlobalHelpers.Models.add(classConstructor);
  return classConstructor;
}

export function Field(joiSchema: Joi.Schema) {
  return function(target: InstanceType<OrmDocumentClass>, propertyKey: string) {
    let modelConstructor = target.constructor as OrmDocumentClass;

    if (!OrmGlobalHelpers.Validators.has(modelConstructor)) {
      OrmGlobalHelpers.Validators.set(modelConstructor, {});
    }

    if (!OrmGlobalHelpers.Fields.has(modelConstructor)) {
      OrmGlobalHelpers.Fields.set(modelConstructor, []);
    }

    let validatorsForTarget = OrmGlobalHelpers.Validators.get(modelConstructor) as Joi.SchemaMap;
    validatorsForTarget[propertyKey] = joiSchema;

    let fieldsForTarget = OrmGlobalHelpers.Fields.get(modelConstructor) as string[];
    fieldsForTarget.push(propertyKey);
  }
}

export function ObjectIdField() {
  return function(target: InstanceType<OrmDocumentClass>, propertyKey: string) {
    let modelConstructor = target.constructor as OrmDocumentClass;

    if (!OrmGlobalHelpers.Validators.has(modelConstructor)) {
      OrmGlobalHelpers.Validators.set(modelConstructor, {});
    }

    if (!OrmGlobalHelpers.Fields.has(modelConstructor)) {
      OrmGlobalHelpers.Fields.set(modelConstructor, []);
    }

    let validatorsForTarget = OrmGlobalHelpers.Validators.get(modelConstructor) as Joi.SchemaMap;
    validatorsForTarget[propertyKey] = Joi.object().type(ObjectId).required();

    let fieldsForTarget = OrmGlobalHelpers.Fields.get(modelConstructor) as string[];
    fieldsForTarget.push(propertyKey);
  }
}
