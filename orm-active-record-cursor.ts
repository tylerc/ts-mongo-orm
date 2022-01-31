import {
  CollationOptions, CountOptions, CursorFlag,
  FindCursor,
  ReadPreference, SortDirection
} from "mongodb";
import {OrmDocumentInstance} from "./orm-decorators";
import {StrictFilterQuery} from "./orm-strict-mongodb-types";
import { Document } from "bson";

export class ActiveRecordCursor<
  ActiveRecordForModel extends { _document: OrmDocumentInstance, _isPersisted: boolean }
  > {
  constructor(
    public activeRecordModelConstructor: new(...args: any[]) => ActiveRecordForModel,
    public normalCursor: FindCursor<ActiveRecordForModel['_document']>
  ) {}

  addCursorFlag(flag: CursorFlag, value: boolean) {
    this.normalCursor.addCursorFlag(flag, value);
    return this;
  }

  addQueryModifier(name: string, value: boolean) {
    this.normalCursor.addQueryModifier(name, value);
    return this;
  }

  batchSize(value: number) {
    this.normalCursor.batchSize(value);
    return this;
  }

  clone() {
    return new ActiveRecordCursor<ActiveRecordForModel>(
      this.activeRecordModelConstructor,
      this.normalCursor.clone()
    );
  }

  close() {
    return this.normalCursor.close();
  }

  collation(value: CollationOptions) {
    this.normalCursor.collation(value);
    return this;
  }

  comment(value: string) {
    this.normalCursor.comment(value);
    return this;
  }

  count(options?: CountOptions): Promise<number> {
    if (options) {
      return this.normalCursor.count(options);
    } else {
      return this.normalCursor.count();
    }
  }

  explain(): Promise<Document> {
    return this.normalCursor.explain();
  }

  filter(filter: StrictFilterQuery<ActiveRecordForModel['_document']>) {
    this.normalCursor.filter(filter);
    return this;
  }

  forEach(iterator: (doc: ActiveRecordForModel) => boolean | void) {
    this.normalCursor.forEach((doc: ActiveRecordForModel['_document']) => {
      let activeRecord = new this.activeRecordModelConstructor();
      activeRecord._document = doc;
      activeRecord._isPersisted = true;
      iterator(activeRecord);
    });
  }

  hasNext(): Promise<boolean> {
    return this.normalCursor.hasNext();
  }

  hint(hint: string | object) {
    this.normalCursor.hint(hint);
    return this;
  }

  isClosed() {
    return this.normalCursor.closed;
  }

  limit(value: number) {
    this.normalCursor.limit(value);
    return this;
  }

  map(transform: (document: ActiveRecordForModel['_document']) => ActiveRecordForModel['_document']) {
    this.normalCursor.map(transform);
    return this;
  }

  max(max: object) {
    this.normalCursor.max(max);
    return this;
  }

  maxAwaitTimeMS(value: number) {
    this.normalCursor.maxAwaitTimeMS(value);
    return this;
  }

  maxTimeMS(value: number) {
    this.normalCursor.maxTimeMS(value);
    return this;
  }

  min(min: object) {
    this.normalCursor.min(min);
    return this;
  }

  async next(): Promise<ActiveRecordForModel | null> {
    let result = await this.normalCursor.next();
    if (!result) {
      return null;
    } else {
      let activeRecord = new this.activeRecordModelConstructor();
      activeRecord._document = result;
      activeRecord._isPersisted = true;
      return activeRecord;
    }
  }

  project(value: { [K in keyof ActiveRecordForModel['_document']]?: 1 | 0 }) {
    this.normalCursor.project(value);
    return this;
  }

  rewind() {
    this.normalCursor.rewind();
  }

  setReadPreference(readPreference: ReadPreference) {
    this.normalCursor = this.normalCursor.withReadPreference(readPreference);
    return this;
  }

  skip(value: number) {
    this.normalCursor.skip(value);
    return this;
  }

  sort<Keys extends  keyof ActiveRecordForModel['_document']>(sorts: { [K in Keys]: SortDirection }) {
    this.normalCursor.sort(sorts);
    return this;
  }

  async toArray(): Promise<ActiveRecordForModel[]> {
    return (await this.normalCursor.toArray()).map((doc) => {
      let activeRecord = new this.activeRecordModelConstructor();
      activeRecord._document = doc;
      activeRecord._isPersisted = true;
      return activeRecord;
    });
  }
}
