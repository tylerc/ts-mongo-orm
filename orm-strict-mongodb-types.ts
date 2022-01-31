import {Timestamp} from "bson";
import {OrmDocumentInstance} from "./orm-decorators";

export type StrictCondition<T, P extends keyof T> = {
  $eq?: T[P];
  $gt?: T[P];
  $gte?: T[P];
  $in?: Array<T[P]>;
  $lt?: T[P];
  $lte?: T[P];
  $ne?: T[P];
  $nin?: Array<T[P]>;
  $and?: Array<StrictFilterQuery<T[P]> | T[P]>;
  $or?: Array<StrictFilterQuery<T[P]> | T[P]>;
  $not?: Array<StrictFilterQuery<T[P]> | T[P]> | T[P];
  $expr?: any;
  $jsonSchema?: any;
  $mod?: [number, number];
  $regex?: RegExp;
  $options?: string;
  $text?: {
    $search: string;
    $language?: string;
    $caseSensitive?: boolean;
    $diacraticSensitive?: boolean;
  };
  $where?: object;
  $geoIntersects?: object;
  $geoWithin?: object;
  $near?: object;
  $nearSphere?: object;
  $elemMatch?: object;
  $size?: number;
  $bitsAllClear?: object;
  $bitsAllSet?: object;
  $bitsAnyClear?: object;
  $bitsAnySet?: object;
  [key: string]: any;
};

export type StrictFilterQuery<DocumentInstance> = {
  [P in keyof DocumentInstance]?: DocumentInstance[P] | (DocumentInstance[P] extends Array<any> ? DocumentInstance[P][number] : never) | StrictCondition<DocumentInstance, P>;
};

// TODO: 1. We need some mechanism by which we can do type-safe updates and queries based on nested fields
//   (e.g. {$set: {"a.b": 1}} or {$inc: {"nestedArray.0.counter": 1}}):
export type StrictUpdateQuery<T> = {
  $inc?: { [P in keyof T]?: T[P] extends number ? number : never };
  $min?: { [P in keyof T]?: T[P] extends number ? number : never };
  $max?: { [P in keyof T]?: T[P] extends number ? number : never };
  $mul?: { [P in keyof T]?: T[P] extends number ? number : never };
  $set?: Partial<T>;
  $setOnInsert?: Partial<T>;
  $unset?: { [P in keyof T]?: '' | 1 };
  $rename?: { [P in keyof T]: string | never };
  // $currentDate?: {
  //   [P in keyof T]?:
  //   T[P] extends Date ? (true | { $type: "date"}) :
  //     T[P] extends Timestamp ? {$type: "timestamp"} : never
  // };
  $addToSet?: { [P in keyof T]?: T[P] extends Array<any> ? (T[P][0] | { $each: T[P] }) : never };
  $pop?: { [P in keyof T]?: T[P] extends Array<any> ? (-1 | 1) : never };
  $pull?: { [P in keyof T]?: T[P] extends Array<any> ? StrictFilterQuery<{_id: any, field: T[P][0]}>['field'] : never };
  $push?: { [P in keyof T]?: T[P] extends Array<any> ? (T[P][0] | { $each: T[P] }) : never };
  $pullAll?: { [P in keyof T]?: T[P] extends Array<any> ? T[P] : never };
  $bit?: { [P in keyof T]?: T[P] extends number ? ({and: number} | {or: number} | {xor: number}) : never };
};

export interface StrictIndexSpecification<DocumentInstance extends OrmDocumentInstance> {
  key: {
    [K in keyof DocumentInstance]?: -1 | 1
  }
}
