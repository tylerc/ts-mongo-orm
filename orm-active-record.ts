import {
  Collection, CollectionInsertManyOptions, CollectionInsertOneOptions, CollStats, CommandCursor,
  CommonOptions,
  Db,
  DeleteWriteOpResultObject,
  FindAndModifyWriteOpResultObject,
  FindOneAndDeleteOption,
  FindOneAndReplaceOption, FindOneAndUpdateOption,
  FindOneOptions, GeoHaystackSearchOptions,
  IndexOptions, InsertOneWriteOpResult, InsertWriteOpResult,
  MongoClient,
  MongoCountPreferences,
  ReadPreference, ReplaceOneOptions, ReplaceWriteOpResult, UpdateManyOptions, UpdateOneOptions,
  UpdateWriteOpResult
} from "mongodb";
import * as Joi from "@hapi/joi";
import {StrictFilterQuery, StrictIndexSpecification, StrictUpdateQuery} from "./orm-strict-mongodb-types";
import {TypeSafeBuilder} from "./orm-type-safe-builder";
import {ActiveRecordCursor} from "./orm-active-record-cursor";
import {OrmGlobalHelpers} from "./orm-global-helpers";
import {OrmDocumentClass} from "./orm-decorators";


export interface ActiveRecordInstance<DocumentType> {
  _document: DocumentType;
  _isPersisted: boolean;

  save(): Promise<UpdateWriteOpResult>;
  delete(): Promise<DeleteWriteOpResultObject>;
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

        save(): Promise<UpdateWriteOpResult>;
        delete(): Promise<DeleteWriteOpResultObject>;
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
    builder(): TypeSafeBuilder<InstanceType<BaseClass>['_document']>;
    create(doc: InstanceType<BaseClass>['_document']): InstanceType<BaseClass>;
    createAndSave(doc: InstanceType<BaseClass>['_document']): Promise<{record: InstanceType<BaseClass>, result: UpdateWriteOpResult}>
    countDocuments(query: StrictFilterQuery<InstanceType<BaseClass>['_document']>, options?: MongoCountPreferences): Promise<number>;
    createIndex(field: keyof InstanceType<BaseClass>['_document'], option?: IndexOptions): Promise<string>;
    createIndexes(indexSpecs: StrictIndexSpecification<InstanceType<BaseClass>['_document']>[]): Promise<any>;
    deleteMany(filter: StrictFilterQuery<InstanceType<BaseClass>['_document']>, options?: CommonOptions): Promise<DeleteWriteOpResultObject>;
    deleteOne(filter: StrictFilterQuery<InstanceType<BaseClass>['_document']>, options?: CommonOptions & { bypassDocumentValidation?: boolean }): Promise<DeleteWriteOpResultObject>;
    distinct<Key extends Extract<keyof InstanceType<BaseClass>['_document'], string>>(
      key: Key,
      query: StrictFilterQuery<InstanceType<BaseClass>['_document']>,
      options?: { readPreference?: ReadPreference | string, maxTimeMS?: number }
    ): Promise<InstanceType<BaseClass>['_document'][Key][]>;
    drop(): Promise<any>;
    dropIndex(indexName: string, options?: CommonOptions & { maxTimeMS?: number }): Promise<any>;
    dropIndexes(options?: { maxTimeMS?: number }): Promise<any>;
    estimatedDocumentCount(query: StrictFilterQuery<InstanceType<BaseClass>['_document']>, options?: MongoCountPreferences): Promise<number>;
    find(query: StrictFilterQuery<InstanceType<BaseClass>['_document']>): ActiveRecordCursor<InstanceType<BaseClass>>;
    findAll(): Promise<InstanceType<BaseClass>[]>;
    findOne(filter: StrictFilterQuery<InstanceType<BaseClass>['_document']>, options?: FindOneOptions): Promise<InstanceType<BaseClass> | null>;
    findOneAndDelete(filter: StrictFilterQuery<InstanceType<BaseClass>['_document']>, options?: FindOneAndDeleteOption): Promise<FindAndModifyWriteOpResultObject<InstanceType<BaseClass>>>;
    findOneAndReplace(filter: StrictFilterQuery<InstanceType<BaseClass>['_document']>, replacement: InstanceType<BaseClass>['_document'], options?: FindOneAndReplaceOption): Promise<FindAndModifyWriteOpResultObject<InstanceType<BaseClass>>>;
    findOneAndUpdate(filter: StrictFilterQuery<InstanceType<BaseClass>['_document']>, update: StrictUpdateQuery<InstanceType<BaseClass>['_document']> | InstanceType<BaseClass>['_document'], options?: FindOneAndUpdateOption): Promise<FindAndModifyWriteOpResultObject<InstanceType<BaseClass>>>;
    geoHaystackSearch(x: number, y: number, options?: GeoHaystackSearchOptions): Promise<InstanceType<BaseClass>[]>;
    indexes(): Promise<any>;
    indexExists(indexes: string | string[]): Promise<boolean>;
    indexInformation(): Promise<any>;
    insertMany(docs: InstanceType<BaseClass>['_document'][], options?: CollectionInsertManyOptions): Promise<InsertWriteOpResult>;
    insertOne(doc: InstanceType<BaseClass>['_document'], options?: CollectionInsertOneOptions): Promise<InsertOneWriteOpResult>;
    isCapped(): Promise<any>;
    listIndexes(options?: { batchSize?: number, readPreference?: ReadPreference | string }): CommandCursor;
    options(): Promise<any>;
    reIndex(): Promise<any>;
    replaceOne(filter: StrictFilterQuery<InstanceType<BaseClass>['_document']>, doc: InstanceType<BaseClass>['_document'], options?: ReplaceOneOptions): Promise<ReplaceWriteOpResult>;
    stats(options?: { scale: number }): Promise<CollStats>;
    updateMany(filter: StrictFilterQuery<InstanceType<BaseClass>['_document']>, update: StrictUpdateQuery<InstanceType<BaseClass>['_document']>, options?: UpdateManyOptions): Promise<UpdateWriteOpResult>;
    updateOne(filter: StrictFilterQuery<InstanceType<BaseClass>['_document']>, update: StrictUpdateQuery<InstanceType<BaseClass>['_document']>, options?: UpdateOneOptions): Promise<UpdateWriteOpResult>;
  } {
    type BaseClassInstance = InstanceType<BaseClass>;
    type DocumentInstance = BaseClassInstance['_document'];

    return class ActiveRecordForModel extends klass {
      static builder(): TypeSafeBuilder<DocumentInstance> {
        return new TypeSafeBuilder();
      }

      static create(doc: DocumentInstance): BaseClassInstance {
        let activeRecord: BaseClassInstance = new (ActiveRecordForModel as any)();
        activeRecord._document = doc;
        return activeRecord;
      }

      static async createAndSave(doc: DocumentInstance): Promise<{record: BaseClassInstance, result: UpdateWriteOpResult}> {
        let activeRecord: BaseClassInstance = new (ActiveRecordForModel as any)();
        activeRecord._document = doc;
        let result = await activeRecord.save();
        return {record: activeRecord, result};
      }

      static countDocuments(query: StrictFilterQuery<DocumentInstance>, options?: MongoCountPreferences): Promise<number> {
        return ActiveRecordForModel.collection.countDocuments(query, options);
      }

      static createIndex(field: keyof DocumentInstance, option?: IndexOptions): Promise<string> {
        return ActiveRecordForModel.collection.createIndex(field, option);
      }

      static createIndexes(indexSpecs: StrictIndexSpecification<DocumentInstance>[]): Promise<any> {
        return ActiveRecordForModel.collection.createIndexes(indexSpecs);
      }

      static deleteMany(filter: StrictFilterQuery<DocumentInstance>, options?: CommonOptions): Promise<DeleteWriteOpResultObject> {
        return ActiveRecordForModel.collection.deleteMany(filter, options);
      }

      static deleteOne(filter: StrictFilterQuery<DocumentInstance>, options?: CommonOptions & { bypassDocumentValidation?: boolean }): Promise<DeleteWriteOpResultObject> {
        return ActiveRecordForModel.collection.deleteOne(filter, options);
      }

      static distinct<Key extends Extract<keyof DocumentInstance, string>>(
        key: Key,
        query: StrictFilterQuery<DocumentInstance>,
        options?: { readPreference?: ReadPreference | string, maxTimeMS?: number }
      ): Promise<DocumentInstance[Key][]> {
        return ActiveRecordForModel.collection.distinct(key, query, options);
      }

      static drop() {
        return ActiveRecordForModel.collection.drop();
      }

      static dropIndex(indexName: string, options?: CommonOptions & { maxTimeMS?: number }): Promise<any> {
        return ActiveRecordForModel.collection.dropIndex(indexName, options);
      }

      static dropIndexes(options?: { maxTimeMS?: number }): Promise<any> {
        return ActiveRecordForModel.collection.dropIndexes(options);
      }

      static estimatedDocumentCount(query: StrictFilterQuery<DocumentInstance>, options?: MongoCountPreferences): Promise<number> {
        return ActiveRecordForModel.collection.estimatedDocumentCount(query, options);
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

      static async findOne(filter: StrictFilterQuery<DocumentInstance>, options: FindOneOptions = {}): Promise<BaseClassInstance | null> {
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

      static async findOneAndDelete(filter: StrictFilterQuery<DocumentInstance>, options?: FindOneAndDeleteOption): Promise<FindAndModifyWriteOpResultObject<BaseClassInstance>> {
        let result = await ActiveRecordForModel.collection.findOneAndDelete(filter, options);
        if (result.value) {
          let activeRecord = new ActiveRecordForModel();
          activeRecord._document = result.value;
          activeRecord._isPersisted = false;
          result.value = activeRecord;
        }

        return result;
      }

      static async findOneAndReplace(filter: StrictFilterQuery<DocumentInstance>, replacement: DocumentInstance, options?: FindOneAndReplaceOption): Promise<FindAndModifyWriteOpResultObject<BaseClassInstance>> {
        let result = await ActiveRecordForModel.collection.findOneAndReplace(filter, replacement, options);
        if (result.value) {
          let activeRecord = new ActiveRecordForModel();
          activeRecord._document = result.value;
          activeRecord._isPersisted = !(options && options.returnOriginal);
          result.value = activeRecord;
        }

        return result;
      }

      static async findOneAndUpdate(filter: StrictFilterQuery<DocumentInstance>, update: StrictUpdateQuery<DocumentInstance> | DocumentInstance, options?: FindOneAndUpdateOption): Promise<FindAndModifyWriteOpResultObject<BaseClassInstance>> {
        let result = await ActiveRecordForModel.collection.findOneAndUpdate(filter, update, options);
        if (result.value) {
          let activeRecord = new ActiveRecordForModel();
          activeRecord._document = result.value;
          activeRecord._isPersisted = !(options && options.returnOriginal);
          result.value = activeRecord;
        }

        return result;
      }

      static async geoHaystackSearch(x: number, y: number, options?: GeoHaystackSearchOptions): Promise<BaseClassInstance[]> {
        let results: BaseClassInstance['_document'][] = await ActiveRecordForModel.collection.geoHaystackSearch(x, y, options);
        return results.map((r) => {
          let activeRecord: BaseClassInstance = new (ActiveRecordForModel as any)();
          activeRecord._document = r;
          activeRecord._isPersisted = true;
          return activeRecord;
        });
      }

      static indexes() {
        return ActiveRecordForModel.collection.indexes();
      }

      static indexExists(indexes: string | string[]): Promise<boolean> {
        return ActiveRecordForModel.collection.indexExists(indexes);
      }

      static indexInformation(): Promise<any> {
        return ActiveRecordForModel.collection.indexInformation();
      }

      static insertMany(docs: DocumentInstance[], options?: CollectionInsertManyOptions): Promise<InsertWriteOpResult> {
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

      static insertOne(doc: DocumentInstance, options?: CollectionInsertOneOptions): Promise<InsertOneWriteOpResult> {
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

      static listIndexes(options?: { batchSize?: number, readPreference?: ReadPreference | string }): CommandCursor {
        return ActiveRecordForModel.collection.listIndexes(options);
      }

      static options() {
        return ActiveRecordForModel.collection.options();
      }

      static reIndex() {
        return ActiveRecordForModel.collection.reIndex();
      }

      static replaceOne(filter: StrictFilterQuery<DocumentInstance>, doc: DocumentInstance, options?: ReplaceOneOptions): Promise<ReplaceWriteOpResult> {
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

      static stats(options?: { scale: number }): Promise<CollStats> {
        return ActiveRecordForModel.collection.stats(options);
      }

      static updateMany(filter: StrictFilterQuery<DocumentInstance>, update: StrictUpdateQuery<DocumentInstance>, options?: UpdateManyOptions): Promise<UpdateWriteOpResult> {
        // TODO: 1. Validations on update would be nice (but also would be tricky, maybe just add hooks and let users validate?)
        return ActiveRecordForModel.collection.updateMany(filter, update, options);
      }

      static updateOne(filter: StrictFilterQuery<DocumentInstance>, update: StrictUpdateQuery<DocumentInstance>, options?: UpdateOneOptions): Promise<UpdateWriteOpResult> {
        // TODO: 1. Validations on update would be nice (but also would be tricky, maybe just add hooks and let users validate?)
        return ActiveRecordForModel.collection.updateOne(filter, update, options);
      }
    }
  }
}
