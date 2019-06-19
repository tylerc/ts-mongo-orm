// Inspired by https://blog.fullsnackdev.com/post/typescript-builder-pattern/
export class TypeSafeBuilder<TypeBeingBuilt, TypeWeCurrentlyHave extends {} = {}> {
  protected current: TypeWeCurrentlyHave = {} as TypeWeCurrentlyHave;

  prop<
    KeyBeingSet extends Exclude<keyof TypeBeingBuilt, keyof TypeWeCurrentlyHave>,
    TypeOfValueBeingSet extends TypeBeingBuilt[KeyBeingSet]
    >(
    key: KeyBeingSet,
    value: TypeOfValueBeingSet
  ) {
    type NewPartialType = TypeWeCurrentlyHave & Pick<TypeBeingBuilt, KeyBeingSet>;

    let instance = {
      ...this.current,
      ...{ [key]: value }
    } as NewPartialType;

    let newBuilder = new TypeSafeBuilder<TypeBeingBuilt, NewPartialType>();
    newBuilder.current = instance;
    return newBuilder;
  }

  props<
    KeysBeingSet extends Exclude<keyof TypeBeingBuilt, keyof TypeWeCurrentlyHave>,
    >(
    obj: { [Key in KeysBeingSet]: TypeBeingBuilt[Key] }
  ) {
    type NewPartialType = TypeWeCurrentlyHave & Pick<TypeBeingBuilt, KeysBeingSet>;

    let instance = {
      ...this.current,
      ...obj
    } as NewPartialType;

    let newBuilder = new TypeSafeBuilder<TypeBeingBuilt, NewPartialType>();
    newBuilder.current = instance;
    return newBuilder;
  }

  build() {
    return this.current;
  }
}
