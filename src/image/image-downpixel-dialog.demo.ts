import { imageDownpixelDialog } from './image-downpixel-dialog.ts';
const spec=imageDownpixelDialog({width:320,height:200,preview:console.log,commit:console.log,cancel(){}});console.log(spec.validate(spec.initial));
