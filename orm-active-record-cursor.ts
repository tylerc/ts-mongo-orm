import {CollationDocument, Cursor, CursorCommentOptions, CursorResult, IteratorCallback, ReadPreference} from "mongodb";
import {OrmDocumentInstance} from "./orm-decorators";
import {StrictFilterQuery} from "./orm-strict-mongodb-types";

export class ActiveRecordCursor<
  ActiveRecordForModel extends { _document: OrmDocumentInstance, _isPersisted: boolean }
  > {
  constructor(
    public activeRecordModelConstructor: new(...args: any[]) => ActiveRecordForModel,
    public normalCursor: Cursor<ActiveRecordForModel['_document']>
  ) {}

  addCursorFlag(flag: string, value: boolean) {
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

  collation(value: CollationDocument) {
    this.normalCursor.collation(value);
    return this;
  }

  comment(value: string) {
    this.normalCursor.comment(value);
    return this;
  }

  count(applySkipLimit?: boolean, options?: CursorCommentOptions): Promise<number> {
    return this.normalCursor.count(applySkipLimit, options);
  }

  explain(): Promise<CursorResult> {
    return this.normalCursor.explain();
  }

  filter(filter: StrictFilterQuery<ActiveRecordForModel['_document']>) {
    this.normalCursor.filter(filter);
    return this;
  }

  forEach(iterator: IteratorCallback<ActiveRecordForModel>) {
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
    return this.normalCursor.isClosed();
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

  maxScan(maxScan: object) {
    this.normalCursor.maxScan(maxScan);
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

  setCursorOption(field: string, value: object) {
    this.normalCursor.setCursorOption(field, value);
    return this;
  }

  setReadPreference(readPreference: string | ReadPreference) {
    this.normalCursor.setReadPreference(readPreference);
    return this;
  }

  skip(value: number) {
    this.normalCursor.skip(value);
    return this;
  }

  sort(sorts: { [K in keyof ActiveRecordForModel['_document']]?: -1 | 1 }) {
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
