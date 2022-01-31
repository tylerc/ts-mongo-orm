import {
  Collection,
  CollStats,
  Db,
  DeleteResult,
  MongoClient,
  ReadPreference,
  UpdateResult,
  Document,
  CountOptions,
  CreateIndexesOptions,
  DeleteOptions,
  FindOptions,
  FindOneAndDeleteOptions,
  DropIndexesOptions,
  FindOneAndReplaceOptions,
  FindOneAndUpdateOptions,
  BulkWriteOptions,
  InsertManyResult,
  InsertOneResult,
  ListIndexesCursor,
  ReplaceOptions,
  UpdateOptions,
  CountDocumentsOptions,
  DistinctOptions,
  EstimatedDocumentCountOptions, ListIndexesOptions, UpdateFilter, InsertOneOptions, CollStatsOptions
} from "mongodb";
import * as Joi from "@hapi/joi";
import {StrictFilterQuery, StrictIndexSpecification, StrictUpdateQuery} from "./orm-strict-mongodb-types";
import {ActiveRecordCursor} from "./orm-active-record-cursor";
import {OrmGlobalHelpers} from "./orm-global-helpers";
import { OrmDocumentClass, OrmDocumentInstance } from "./orm-decorators";

type ModifyResult<BaseClassInstance> = { value: BaseClassInstance | null, _document?: any, lastErrorObject: any, ok: 0 | 1 };

export interface ActiveRecordInstance<DocumentType extends Document> {
  _document: DocumentType;
  _isPersisted: boolean;

  save(): Promise<UpdateResult | Document>;
  delete(): Promise<DeleteResult>;
  reload(): Promise<void>;
  validate(): Joi.ValidationErrorItem[];
  isValid(): boolean;
  isPersisted(): boolean;
  toJSON(): object;
}

export class ActiveRecord {
  static for<DocumentClass extends OrmDocumentClass, ModelClass extends DocumentClass>(
    documentConstructor: DocumentClass,
    modelConstructor: ModelClass,
    databaseConnectionName: string = "default"
  ) {
    ["save", "delete", "reload", "validate", "isValid", "isPersisted", "toJSON", "_document", "_isPersisted"].forEach(
        (name) => {
          if (documentConstructor.prototype[name]) {
            console.warn("ActiveRecord.for was passed a document class that contains a field or " +
              "method named " + name + ". This will be shadowed by ActiveRecord, and your field/method will not " +
              "be used. This was likely an unintentional mistake on your part. Please use a different name to " +
              "avoid this conflict."
            );
            console.warn("The document class in question is:", documentConstructor);
          }

          if (modelConstructor.prototype[name]) {
            console.warn("ActiveRecord.for was passed a model class that contains a field or " +
              "method named " + name + ". This will be shadowed by ActiveRecord, and your field/method will not " +
              "be used. This was likely an unintentional mistake on your part. Please use a different name to " +
              "avoid this conflict."
            );
            console.warn("The model class in question is:", modelConstructor);
          }
      }
    );

    let prelude = ActiveRecord.enhanceWithInstanceMethods<DocumentClass, ModelClass>(documentConstructor, modelConstructor, databaseConnectionName);
    return ActiveRecord.enhanceWithStaticMethods<typeof prelude>(prelude);
  }

  static enhanceWithInstanceMethods<DocumentClass extends OrmDocumentClass, ModelClass extends DocumentClass>(
    documentConstructor: DocumentClass,
    modelConstructor: ModelClass,
    databaseConnectionName: string = "default",
  ): ModelClass & {
    new(...args: any[]): ActiveRecordInstance<InstanceType<DocumentClass>>;
    fields: string[];
    database: Db;
    collection: Collection;
    validators: Joi.SchemaMap;
  } {
    type DocumentInstance = InstanceType<DocumentClass>;

    class ActiveRecordForModel extends modelConstructor implements ActiveRecordInstance<DocumentInstance> {
      static fields = OrmGlobalHelpers.Fields.get(documentConstructor) || [];
      static validators = OrmGlobalHelpers.Validators.get(documentConstructor) || {};
      static database: Db; // Lazily initialized below in OrmGlobalHelpers.CallWhenConnected.
      static collection: Collection; // Lazily initialized below in OrmGlobalHelpers.CallWhenConnected.

      _document = {} as any;
      _isPersisted = false;

      constructor(...args: any[]) {
        super(...args);

        Object.defineProperty(this, '_document', {enumerable: false});

        ActiveRecordForModel.fields.forEach((fieldName) => {
          (this._document as any)[fieldName] = (this as any)[fieldName];

          Object.defineProperty(this, fieldName, {
            configurable: false,
            enumerable: true,
            get: () => {
              return (this._document as any)[fieldName];
            },
            set: (newVal) => {
              (this._document as any)[fieldName] = newVal;
            }
          });
        });
      }

      async save() {
        if (ActiveRecordForModel.validators) {
          let validationResult = Joi.validate(
            this._document,
            ActiveRecordForModel.validators,
            {
              abortEarly: true,
              convert: false,
              allowUnknown: false,
              skipFunctions: false,
              presence: "required"
            }
          );

          if (validationResult.error) {
            let details = validationResult.error.details;
            let firstError = details[0];

            return Promise.reject(ActiveRecordForModel.name + ".save() for _id " + this._document._id + ": document is malformed: " + firstError.message);
          }
        }

        let result = await ActiveRecordForModel.collection.replaceOne({_id: this._document._id}, this._document, {upsert: true});
        this._isPersisted = true;
        return result;
      }

      async delete() {
        let result = ActiveRecordForModel.collection.deleteOne({_id: this._document._id});
        this._isPersisted = false;
        return result;
      }

      async reload() {
        let found = await ActiveRecordForModel.collection.findOne({_id: this._id});

        if (!found) {
          return Promise.reject(new Error("Tried to reload document with _id " + this._id + " but found none."));
        }

        this._document = found;
        this._isPersisted = true;
      }

      validate() {
        let validationResult = Joi.validate(
          this._document,
          ActiveRecordForModel.validators,
          {
            abortEarly: true,
            convert: false,
            allowUnknown: false,
            skipFunctions: false,
            presence: "required"
          }
        );

        if (validationResult.error) {
          return validationResult.error.details;
        } else {
          return [];
        }
      }

      isValid() {
        return this.validate().length === 0;
      }

      isPersisted() {
        return this._isPersisted;
      }

      // TODO: 1. Lifecycle hooks via annotations (e.g. OnLoad, AfterInit, BeforeUpdate, BeforeInsert, etc.)

      toJSON() {
        return this._document;
      }
    }

    OrmGlobalHelpers.CallWhenConnected(databaseConnectionName, () => {
      let connection = OrmGlobalHelpers.DatabaseConnections.get(databaseConnectionName);

      if (!connection) {
        throw new Error("Unknown database connection " + databaseConnectionName + " specified.");
      }

      ActiveRecordForModel.database = (connection as MongoClient).db(documentConstructor.databaseName);
      ActiveRecordForModel.collection = ActiveRecordForModel.database.collection(documentConstructor.collectionName);
    });

    Object.defineProperty(ActiveRecordForModel, 'name', {value: modelConstructor.name + "ActiveRecord"});

    return ActiveRecordForModel;
  }

  static enhanceWithStaticMethods<
    BaseClass extends {
      new(...args: any[]): {
        _document: { _id: any };
        _isPersisted: boolean;

        save(): Promise<UpdateResult | Document>;
        delete(): Promise<DeleteResult>;
        reload(): Promise<void>;
        validate(): Joi.ValidationErrorItem[];
        isValid(): boolean;
        isPersisted(): boolean;
        toJSON(): object;
      };

      fields: string[];
      database: Db;
      collection: Collection;
      validators: Joi.SchemaMap;
    }>(klass: BaseClass): BaseClass & {
    create(doc: InstanceType<BaseClass>['_document']): InstanceType<BaseClass>;
    createAndSave(doc: InstanceType<BaseClass>['_document']): Promise<{record: InstanceType<BaseClass>, result: UpdateResult | Document}>
    countDocuments(query: StrictFilterQuery<InstanceType<BaseClass>['_document']>, options?: CountOptions): Promise<number>;
    createIndex(field: keyof InstanceType<BaseClass>['_document'], option?: CreateIndexesOptions): Promise<string>;
    createIndexes(indexSpecs: StrictIndexSpecification<InstanceType<BaseClass>['_document']>[]): Promise<any>;
    deleteMany(filter: StrictFilterQuery<InstanceType<BaseClass>['_document']>, options?: DeleteOptions): Promise<DeleteResult>;
    deleteOne(filter: StrictFilterQuery<InstanceType<BaseClass>['_document']>, options?: DeleteOptions & { bypassDocumentValidation?: boolean }): Promise<DeleteResult>;
    distinct<Key extends Extract<keyof InstanceType<BaseClass>['_document'], string>>(
      key: Key,
      query: StrictFilterQuery<InstanceType<BaseClass>['_document']>,
      options?: { readPreference?: ReadPreference | string, maxTimeMS?: number }
    ): Promise<InstanceType<BaseClass>['_document'][Key][]>;
    drop(): Promise<any>;
    dropIndex(indexName: string, options?: DropIndexesOptions): Promise<any>;
    dropIndexes(options?: { maxTimeMS?: number }): Promise<any>;
    estimatedDocumentCount(options?: EstimatedDocumentCountOptions): Promise<number>;
    find(query: StrictFilterQuery<InstanceType<BaseClass>['_document']>): ActiveRecordCursor<InstanceType<BaseClass>>;
    findAll(): Promise<InstanceType<BaseClass>[]>;
    findOne(filter: StrictFilterQuery<InstanceType<BaseClass>['_document']>, options?: FindOptions): Promise<InstanceType<BaseClass> | null>;
    findOneAndDelete(filter: StrictFilterQuery<InstanceType<BaseClass>['_document']>, options?: FindOneAndDeleteOptions): Promise<ModifyResult<InstanceType<BaseClass>>>;
    findOneAndReplace(filter: StrictFilterQuery<InstanceType<BaseClass>['_document']>, replacement: InstanceType<BaseClass>['_document'], options?: FindOneAndReplaceOptions): Promise<ModifyResult<InstanceType<BaseClass>>>;
    // TODO: 1. Can't get the types to work out correctly on for MongoDB v4:
    // findOneAndUpdate(filter: StrictFilterQuery<InstanceType<BaseClass>['_document']>, update: UpdateFilter<InstanceType<BaseClass>['_document']>, options?: FindOneAndUpdateOptions): Promise<ModifyResult<InstanceType<BaseClass>>>;
    indexes(): Promise<any>;
    indexExists(indexes: string | string[]): Promise<boolean>;
    indexInformation(): Promise<any>;
    insertMany(docs: InstanceType<BaseClass>['_document'][], options?: BulkWriteOptions): Promise<InsertManyResult>;
    insertOne(doc: InstanceType<BaseClass>['_document'], options?: BulkWriteOptions): Promise<InsertOneResult>;
    isCapped(): Promise<any>;
    listIndexes(options?: { batchSize?: number, readPreference?: ReadPreference | string }): ListIndexesCursor;
    options(): Promise<any>;
    replaceOne(filter: StrictFilterQuery<InstanceType<BaseClass>['_document']>, doc: InstanceType<BaseClass>['_document'], options?: ReplaceOptions): Promise<UpdateResult | Document>;
    stats(options?: { scale: number }): Promise<CollStats>;
    // TODO: 1. Can't get the types to work out correctly on for MongoDB v4:
    // updateMany(filter: StrictFilterQuery<InstanceType<BaseClass>['_document']>, update: StrictUpdateQuery<InstanceType<BaseClass>['_document']>, options?: UpdateOptions): Promise<UpdateResult | Document>;
    updateOne(filter: StrictFilterQuery<InstanceType<BaseClass>['_document']>, update: StrictUpdateQuery<InstanceType<BaseClass>['_document']>, options?: UpdateOptions): Promise<UpdateResult | Document>;
  } {
    type BaseClassInstance = InstanceType<BaseClass>;
    type DocumentInstance = BaseClassInstance['_document'];

    return class ActiveRecordForModel extends klass {
      static create(doc: DocumentInstance): BaseClassInstance {
        let activeRecord: BaseClassInstance = new (ActiveRecordForModel as any)();
        activeRecord._document = doc;
        return activeRecord;
      }

      static async createAndSave(doc: DocumentInstance): Promise<{record: BaseClassInstance, result: UpdateResult | Document}> {
        let activeRecord: BaseClassInstance = new (ActiveRecordForModel as any)();
        activeRecord._document = doc;
        let result = await activeRecord.save();
        return {record: activeRecord, result};
      }

      static countDocuments(query: StrictFilterQuery<DocumentInstance>, options?: CountDocumentsOptions): Promise<number> {
        if (options) {
          return ActiveRecordForModel.collection.countDocuments(query, options);
        } else {
          return ActiveRecordForModel.collection.countDocuments(query);
        }
      }

      static createIndex(field: keyof DocumentInstance, option?: CreateIndexesOptions): Promise<string> {
        if (option) {
          return ActiveRecordForModel.collection.createIndex(field as string, option);
        } else {
          return ActiveRecordForModel.collection.createIndex(field as string);
        }
      }

      static createIndexes(indexSpecs: StrictIndexSpecification<DocumentInstance>[]): Promise<any> {
        return ActiveRecordForModel.collection.createIndexes(indexSpecs);
      }

      static deleteMany(filter: StrictFilterQuery<DocumentInstance>, options?: DeleteOptions): Promise<DeleteResult> {
        if (options) {
          return ActiveRecordForModel.collection.deleteMany(filter, options);
        } else {
          return ActiveRecordForModel.collection.deleteMany(filter);
        }
      }

      static deleteOne(filter: StrictFilterQuery<DocumentInstance>, options?: DeleteOptions): Promise<DeleteResult> {
        if (options) {
          return ActiveRecordForModel.collection.deleteOne(filter, options);
        } else {
          return ActiveRecordForModel.collection.deleteOne(filter);
        }
      }

      static distinct<Key extends Extract<keyof DocumentInstance, string>>(
        key: Key,
        query: StrictFilterQuery<DocumentInstance>,
        options?: DistinctOptions
      ): Promise<DocumentInstance[Key][]> {
        if (options) {
          return ActiveRecordForModel.collection.distinct(key, query, options);
        } else {
          return ActiveRecordForModel.collection.distinct(key, query);
        }
      }

      static drop() {
        return ActiveRecordForModel.collection.drop();
      }

      static dropIndex(indexName: string, options?: DropIndexesOptions): Promise<any> {
        if (options) {
          return ActiveRecordForModel.collection.dropIndex(indexName, options);
        } else {
          return ActiveRecordForModel.collection.dropIndex(indexName);
        }
      }

      static dropIndexes(options?: DropIndexesOptions): Promise<any> {
        if (options) {
          return ActiveRecordForModel.collection.dropIndexes(options);
        } else {
          return ActiveRecordForModel.collection.dropIndexes();
        }
      }

      static estimatedDocumentCount(options?: EstimatedDocumentCountOptions): Promise<number> {
        if (options) {
          return ActiveRecordForModel.collection.estimatedDocumentCount(options);
        } else {
          return ActiveRecordForModel.collection.estimatedDocumentCount();
        }
      }

      static find(query: StrictFilterQuery<DocumentInstance>): ActiveRecordCursor<BaseClassInstance> {
        return new ActiveRecordCursor<BaseClassInstance>(ActiveRecordForModel as any, ActiveRecordForModel.collection.find(query));
      }

      static async findAll(): Promise<BaseClassInstance[]> {
        let docs = await ActiveRecordForModel.collection.find().toArray();
        return docs.map((doc) => {
          let activeRecord: BaseClassInstance = new (ActiveRecordForModel as any)();
          // TODO: 1. Provide optional mechanism for validating on read.
          activeRecord._document = doc;
          activeRecord._isPersisted = true;
          return activeRecord;
        });
      }

      static async findOne(filter: StrictFilterQuery<DocumentInstance>, options: FindOptions = {}): Promise<BaseClassInstance | null> {
        let result = await ActiveRecordForModel.collection.findOne(filter, options);

        if (!result) {
          return result;
        } else {
          let activeRecord: BaseClassInstance = new (ActiveRecordForModel as any)();
          // TODO: 1. Provide optional mechanism for validating on read.
          activeRecord._document = result;
          activeRecord._isPersisted = true;
          return activeRecord;
        }
      }

      static async findOneAndDelete(filter: StrictFilterQuery<DocumentInstance>, options: FindOneAndDeleteOptions = {}): Promise<ModifyResult<BaseClassInstance>> {
        let result = await ActiveRecordForModel.collection.findOneAndDelete(filter, options);
        if (result.value) {
          let activeRecord = new ActiveRecordForModel() as BaseClassInstance;
          activeRecord._document = result.value;
          activeRecord._isPersisted = false;
          return { value: activeRecord, lastErrorObject: result.lastErrorObject, ok: result.ok, _document: result.value };
        }

        return { value: null, lastErrorObject: result.lastErrorObject, ok: result.ok, _document: result.value };
      }

      static async findOneAndReplace(filter: StrictFilterQuery<DocumentInstance>, replacement: DocumentInstance, options: FindOneAndReplaceOptions = {}): Promise<ModifyResult<BaseClassInstance>> {
        let result = await ActiveRecordForModel.collection.findOneAndReplace(filter, replacement, options);
        if (result.value) {
          let activeRecord = new ActiveRecordForModel() as BaseClassInstance;
          activeRecord._document = result.value;
          activeRecord._isPersisted = !(options && options.returnDocument === 'before');
          return { value: activeRecord, lastErrorObject: result.lastErrorObject, ok: result.ok, _document: result.value };
        }

        return { value: null, lastErrorObject: result.lastErrorObject, ok: result.ok, _document: result.value };
      }

      // TODO: 1. Can't get the types to work out correctly on for MongoDB v4:
      // static async findOneAndUpdate(filter: StrictFilterQuery<DocumentInstance>, update: UpdateFilter<DocumentInstance>, options: FindOneAndUpdateOptions = {}): Promise<ModifyResult<BaseClassInstance>> {
      //   let result = await ActiveRecordForModel.collection.findOneAndUpdate(filter, update, options);
      //   if (result.value) {
      //     let activeRecord = new ActiveRecordForModel();
      //     activeRecord._document = result.value;
      //     activeRecord._isPersisted = !(options && options.returnOriginal);
      //     result.value = activeRecord;
      //   }
      //
      //   return result;
      // }

      static indexes() {
        return ActiveRecordForModel.collection.indexes();
      }

      static indexExists(indexes: string | string[]): Promise<boolean> {
        return ActiveRecordForModel.collection.indexExists(indexes);
      }

      static indexInformation(): Promise<any> {
        return ActiveRecordForModel.collection.indexInformation();
      }

      static insertMany(docs: DocumentInstance[], options: BulkWriteOptions = {}): Promise<InsertManyResult> {
        if (ActiveRecordForModel.validators) {
          for (let i = 0; i < docs.length; i++) {
            let doc = docs[i];

            let validationResult = Joi.validate(
              doc,
              ActiveRecordForModel.validators,
              {
                abortEarly: true,
                convert: false,
                allowUnknown: false,
                skipFunctions: false,
                presence: "required"
              }
            );

            if (validationResult.error) {
              let details = validationResult.error.details;
              let firstError = details[0];

              return Promise.reject(ActiveRecordForModel.name + " document #" + i + " with _id " + doc._id + " from insertMany is malformed: " + firstError.message);
            }
          }
        }

        return ActiveRecordForModel.collection.insertMany(docs, options);
      }

      static insertOne(doc: DocumentInstance, options: InsertOneOptions = {}): Promise<InsertOneResult> {
        if (ActiveRecordForModel.validators) {
          let validationResult = Joi.validate(
            doc,
            ActiveRecordForModel.validators,
            {
              abortEarly: true,
              convert: false,
              allowUnknown: false,
              skipFunctions: false,
              presence: "required"
            }
          );

          if (validationResult.error) {
            let details = validationResult.error.details;
            let firstError = details[0];

            return Promise.reject(ActiveRecordForModel.name + " document with _id " + doc._id + " from insertOne is malformed: " + firstError.message);
          }
        }

        return ActiveRecordForModel.collection.insertOne(doc, options);
      }

      static isCapped(): Promise<any> {
        return ActiveRecordForModel.collection.isCapped();
      }

      static listIndexes(options: ListIndexesOptions = {}): ListIndexesCursor {
        return ActiveRecordForModel.collection.listIndexes(options);
      }

      static options() {
        return ActiveRecordForModel.collection.options();
      }

      static replaceOne(filter: StrictFilterQuery<DocumentInstance>, doc: DocumentInstance, options: ReplaceOptions = {}): Promise<UpdateResult | Document> {
        if (ActiveRecordForModel.validators) {
          let validationResult = Joi.validate(
            doc,
            ActiveRecordForModel.validators,
            {
              abortEarly: true,
              convert: false,
              allowUnknown: false,
              skipFunctions: false,
              presence: "required"
            }
          );

          if (validationResult.error) {
            let details = validationResult.error.details;
            let firstError = details[0];

            return Promise.reject(ActiveRecordForModel.name + " document with _id " + doc._id + " from replaceOne is malformed: " + firstError.message);
          }
        }

        return ActiveRecordForModel.collection.replaceOne(filter, doc, options);
      }

      static stats(options: CollStatsOptions = {}): Promise<CollStats> {
        return ActiveRecordForModel.collection.stats(options);
      }

      // TODO: 1. Can't get the types to work out correctly on for MongoDB v4:
      // static updateMany(filter: StrictFilterQuery<DocumentInstance>, update: StrictUpdateQuery<DocumentInstance>, options: UpdateOptions = {}): Promise<UpdateResult | Document> {
      //   // TODO: 1. Validations on update would be nice (but also would be tricky, maybe just add hooks and let users validate?)
      //   return ActiveRecordForModel.collection.updateMany(filter, update, options);
      // }

      static updateOne(filter: StrictFilterQuery<DocumentInstance>, update: StrictUpdateQuery<DocumentInstance>, options: UpdateOptions = {}): Promise<UpdateResult | Document> {
        // TODO: 1. Validations on update would be nice (but also would be tricky, maybe just add hooks and let users validate?)
        return ActiveRecordForModel.collection.updateOne(filter, update, options);
      }
    }
  }
}
