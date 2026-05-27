// build_html.js — wrap the transpiled JS in the production HTML shell.
// Input:  e6b_built.js
// Output: index.html
//
// The HTML shell loads React 18 + ReactDOM 18 from CDN, rebinds the hooks
// (useState/useEffect/useRef) from the React global so the source JSX can
// keep using them as bare identifiers, then drops in the transpiled bundle.

const fs = require("fs");
const path = require("path");

const JS_PATH = path.join(__dirname, "e6b_built.js");
const OUT = path.join(__dirname, "index.html");

const js = fs.readFileSync(JS_PATH, "utf8");

const HEAD = '<!DOCTYPE html><html lang="en"><head>'
  + '<meta charset="UTF-8">'
  + '<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">'
  + '<meta name="mobile-web-app-capable" content="yes">'
  + '<meta name="apple-mobile-web-app-capable" content="yes">'
  + '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">'
  + '<meta name="apple-mobile-web-app-title" content="E6B">'
  + '<meta name="theme-color" content="#1b2a4a">'
  + '<title>E6B · Aviation Tools</title>'
  + '<link rel="manifest" href="manifest.json">'
  + '<link rel="apple-touch-icon" href="icon-192.png">'
  + '<script crossorigin src="https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js"></script>'
  + '<script crossorigin src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js"></script>'
  + '<style>'
  + '*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}'
  + 'html,body{height:100%;background:#f0f2f5}'
  + 'body{-webkit-font-smoothing:antialiased}'
  + '#root{height:100%;overflow-y:auto;-webkit-overflow-scrolling:touch}'
  + 'input,select,textarea{font-size:16px!important}'
  + '#root{padding-bottom:env(safe-area-inset-bottom)}'
  + '</style>'
  + '</head><body><div id="root"></div><script>\n'
  + 'var _React=React,useState=_React.useState,useEffect=_React.useEffect,useRef=_React.useRef;\n';

const TAIL = '\n</script></body></html>';

const html = HEAD + js + TAIL;
fs.writeFileSync(OUT, html);
console.log(`build_html.js: wrote ${OUT} (${html.length.toLocaleString()} bytes).`);
