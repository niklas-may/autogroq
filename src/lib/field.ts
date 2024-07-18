import consola from "consola";
import type { Documentlike, StringLike } from "./../types";
import type { SchemaContext } from "./schema";
export interface FieldMeta {
  includesResolvable: boolean;
  isResolvable: boolean;
  isIterable: boolean;
}

export interface OnFieldArgs {
  field: Documentlike;
  parentField: Documentlike | undefined;
  result: string;
  children: string;
  meta: FieldMeta;
}

export interface FieldVisitor {
  context: SchemaContext;
  id: string;
  onField: (args: OnFieldArgs) => any;
  result: StringLike;
}

export class SchemaProjection implements FieldVisitor {
  readonly id = "projection";
  result = "";

  constructor(readonly context: SchemaContext) {}

  onField(args: OnFieldArgs) {
    const { field, parentField, children, meta, result } = args;
    const { includesResolvable, isResolvable } = meta;

    const isInArray = parentField?.type === "array";
    const isInArrayWithSiblings = (parentField?.of?.length ?? 1) > 1;
    const isConditonal = isInArray && isInArrayWithSiblings;

    if (!includesResolvable) return (this.result = result);

    if (isResolvable) {
      const res = this.context.resolverService.get(field.type, field.resolver);

      if (!res) {
        consola.error(`Resolver not found`, { field });
        return (this.result = result);
      }
      
      const resolver =
        isConditonal && (parentField.of?.length ?? 0) >= 1 && res.isObject && !res.isRenamed ? res.getUnwrapped(field.name) : res.get(field.name);
      const groq = isConditonal ? this.buildConditionalObject(field.name, resolver) : resolver;
      return (this.result = this.concat(args, groq));
    }

    if (field.type === "document") {
      return (this.result = "...," + (children ?? ""));
    }

    if (field.type === "object") {
      const builder = isConditonal ? this.buildConditionalObject : this.buildObject;
      const obj = builder(field.name, this.buildChildren(args));
      return (this.result = this.concat(args, obj));
    }

    if (field.type === "array") {
      const obj = this.buildArray(field.name, this.buildChildren(args));
      return (this.result = this.concat(args, obj));
    }

    return (this.result = result);
  }

  private buildArray(left: string, right: string) {
    return `${left}[] {\n${right ?? ""}\n}`;
  }

  private buildObject(left: string, right: string) {
    return `${left} {\n${right ?? ""}\n}`;
  }

  private buildConditionalObject(left: string, right: string) {
    return `_type == "${left}" => {\n${right ?? ""}\n}`;
  }

  private buildChildren({ children }: OnFieldArgs) {
    return "...,\n" + (children ?? "");
  }
  private concat({ result }: OnFieldArgs, groq: string) {
    return (result ? result + ",\n" : "") + groq;
  }
}

export class DummyFactory implements FieldVisitor {
  readonly id = "debug";
  result = "string";

  constructor(readonly context: SchemaContext) {}

  onField(args: OnFieldArgs) {
    if (args.meta.isIterable) {
      return this.onObject(args);
    }
    return this.onPrimitive(args);
  }

  private onPrimitive({ field, result }: OnFieldArgs) {
    return (this.result = (result ? result + ",\n" : "") + field.name);
  }

  private onObject({ field, result, children }: OnFieldArgs) {
    return (this.result = field.type === "document" ? children : (result ? result + ",\n" : "") + this.obj(field.name, children));
  }

  private obj(name: string, content: string = "") {
    return (this.result = `${name} {\n${content}\n}`);
  }
}
