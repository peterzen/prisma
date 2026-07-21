import type * as DMMF from '@prisma/dmmf'

export const needNamespace = {
  Json: 'JsonValue',
  Decimal: 'Decimal',
  Bytes: 'Bytes',
  Geometry: 'Geometry',
  Geography: 'Geometry',
}

export function needsNamespace(field: DMMF.Field): boolean {
  if (field.kind === 'object') {
    return true
  }

  if (field.kind === 'scalar') {
    return Object.prototype.hasOwnProperty.call(needNamespace, field.type)
  }
  return false
}

export const GraphQLScalarToJSTypeTable = {
  String: 'string',
  Int: 'number',
  Float: 'number',
  Boolean: 'boolean',
  Long: 'number',
  DateTime: ['Date', 'string'],
  ID: 'string',
  UUID: 'string',
  Json: 'JsonValue',
  Bytes: 'Bytes',
  Decimal: ['Decimal', 'DecimalJsLike', 'number', 'string'],
  BigInt: ['bigint', 'number'],
  Geometry: 'Geometry',
  Geography: 'Geometry',
}

export const JSOutputTypeToInputType = {
  JsonValue: 'InputJsonValue',
  Geometry: 'InputGeometry',
}

export const JSTypeToGraphQLType = {
  string: 'String',
  boolean: 'Boolean',
  object: 'Json',
  symbol: 'Symbol',
}
