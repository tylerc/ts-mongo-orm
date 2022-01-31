ts-mongo-orm
============

`ts-mongo-orm` is a MongoDB ORM inspired by ActiveRecord.

It's still under active development as I use it to build some apps, so until you see the `1.0.0` release, expect things
to change or be missing.

In its current state, it has a fairly complete type-safe wrapper around MongoDB, and I'm already using it productively
in deployed apps. See the "Future Work" section below for what's on the roadmap.

Installation
------------

```
npm install --save ts-mongo-orm
```

Note that the following peer dependencies are required:

- `@hapi/joi` and `@types/hapi__joi` for validation types.
- `mongodb` and `@types/mongodb` for connecting to and using MongoDB.

Example Usage
-------------

See [the ts-mongo-orm-example repo](https://github.com/tylerc/ts-mongo-orm-example) for an example program you can clone
and run.

Below are some selected examples.

Connect to the database:

```ts
import {DatabaseConnectDefault} from "ts-mongo-orm";

(async () => {
    await DatabaseConnectDefault("mongodb://localhost:27017/test");
})();
```

Create define a `User` `ActiveRecord`:

```ts
import {ActiveRecord, Document, Field, ObjectIdField} from "ts-mongo-orm";
import {ObjectId} from "mongodb";
import * as Joi from "@hapi/joi";

@Document
class User {
  static databaseName = "test";
  static collectionName = "users";

  @ObjectIdField()
  _id: ObjectId;

  @Field(Joi.string())
  email: string;

  @Field(Joi.string())
  name: string;

  @Field(Joi.string())
  passwordHash: string;

  @Field(Joi.string())
  passwordSalt: string;

  @Field(Joi.date())
  createdAt: Date;

  constructor() {
    this._id = new ObjectId("000000000000000000000000");
    this.email = "";
    this.name = "";
    this.passwordHash = "";
    this.passwordSalt = "";
    this.createdAt = new Date();
  }
}

export const UserActiveRecord = ActiveRecord.for(User, User);
```

Note that the `ActiveRecord` class has a separation between the _document_ class (which describes purely the data
that will be stored in the database the and validations for that data), and the _model_ class (which could define
additional logic, helpers, computed fields, etc.)

In the above example, there is no additional model logic, so the `User` class is passed for both arguments to
`ActiveRecord.for`. Defining additional model logic would might look like this:

```ts
class UserModel extends User {
  // This will appear on the active record object but will not get saved to the database:
  get nameAndEmail() {
    return this.name + " " + this.email;
  }
}

export const UserActiveRecord = ActiveRecord.for(User, UserModel);
```

Using the `UserActiveRecord` might look like this:

```ts
import {UserActiveRecord} from "./user";

export async function userFindAndLog(email: string) {
    // This query is fully type-checked:
    let user = await UserActiveRecord.findOne({email: email});
    
    if (user) {
        console.log(user.nameAndEmail);
    }
}

export async function userDeleteIfFound(email: string) {
    // This query is fully type-checked:
    let user = await UserActiveRecord.findOne({email: email});

    if (user) {
        console.log("Deleting " + user._id + "...");
        // Since user is an ActiveRecord instance, we can simply call delete()
        // on it to remove it from the DB:
        await user.delete();
    }
}
```

Goals
-----

- Be able to use the `ActiveRecord` pattern to find and update documents, similar to Ruby on Rails.
- Make it easy to validate objects going into and coming out of the database.
- Make it easy to define those validations by using decorators to annotate the necessary validations alongside the type
  definitions.
- Provide a typed version of most (or all if possible) MongoDB APIs, specific to each type of document. For example,
  `collection.update({}, {$set: {a: 1}})` should fail to typecheck if `a` is not a `number` or does not exist on the
  document type.
- Minimal overhead. Getting the type-safety guarantees and validation should not come at a huge cost of speed, but a
  small cost is expected.
- Optional:
  - If you need to bail out of the typings for whatever reason, that should be easy.
  - If you need to not use the `ActiveRecord` pattern, but instead update or query the database directly, that should be
    easy.

Non-Goals
---------

This package will not do these things:

- Have zero-overhead abstractions. Validation and the ActiveRecord pattern incur some cost by their very nature.
- Provide a type-safe way of dealing with aggregations. Too much pain for too little gain.
- Have exhaustive support for various versions of the `mongodb` library. Pull requests that add support for older
  versions are welcome, but I will focus only on the `4.x` branch of the `mongodb` library.
- Support for validation libraries other than `joi`. Pull requests making this optional are welcome.
- Create typings for an existing DB automatically.

It's not that any of these things are bad, just that they are either outside the scope of this package, or require more
time than I have.

Issues and Pull Requests
------------------------

If you see an issue or a way to improve `ts-mongo-orm` feel free to open an issue or a pull request!

Please include as much as possible, and keep in mind that issues with associated pull requests are much more likely to
get merged, as my time to manage issues on this project is limited.

Future Work
-----------

- [ ] Updating to the v4.x driver broke some things. Might be worth rethinking how the superstructure of this module
      works so it's not as fragile to the whims of MongoDB. I'd rather expose the MongoDB API directly somehow, and
      just transparently provide my niceties on top.
- [ ] A mechanism for doing type-safe updates and queries on nested fields (e.g. a type safe `{$set: {"a.b.c": 123}}`)
- [ ] Lifecycle hooks (e.g. OnLoad, AfterInit, BeforeUpdate, BeforeInsert, etc.)
- [ ] Easy optional mechanism for running validations when _reading_ from the database.

License
-------

The license is MIT, see the `LICENSE` file for more details.
