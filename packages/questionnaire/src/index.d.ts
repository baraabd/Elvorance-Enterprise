export type Option={id:string;label:string};
export type Activity={id:string;label:string;active:boolean};
export type Question={id:string;label:string;section:'challenge'|'goal'|'solution';type:'single'|'multi'|'text'|'number';required:boolean;active:boolean;activityIds:string[];order:number;options:Option[];otherAllowed:boolean;min:number|null;max:number|null};
export type Configuration={schemaVersion:number;revision:number;activities:Activity[];questions:Question[];updatedAt:string|null};
export const QUESTION_SECTIONS:Record<Question['section'],string>;
export const FIELD_TYPES:Record<Question['type'],string>;
export function defaultConfiguration():Configuration;
export function configured(state:{formConfig?:Configuration}|null):Configuration;
export function visibleQuestions(config:Configuration, activityId:string, section:Question['section']):Question[];
export function validateConfiguration(value:unknown,catalog?:unknown[]):string[];
export function validateAnswers(config:Configuration, activityId:string, answers:Record<string,unknown>,catalog?:any[]):Record<string,string>;
export function recommendServices(config:Configuration, activity:string, answers:Record<string,unknown>, catalog:any[]):any[];

export function defaultCatalog():any[];
