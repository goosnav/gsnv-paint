import { cadExpressionPolicy } from './cad-expression-policy.ts';
console.log(cadExpressionPolicy({units:'mm',variables:[{name:'width',expression:{source:'40',kind:'length'}}],linearMm:1e-7,parameters:[{expression:{source:'width / 2',kind:'length'},range:'positive'}],bindUnits:true}));
