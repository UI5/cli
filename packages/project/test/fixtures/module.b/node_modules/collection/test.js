import {globby} from 'globby';

const paths = await globby(["library.a"]);
console.log("paths")
