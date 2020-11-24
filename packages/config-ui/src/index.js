import React from 'react';
import ReactDOM from 'react-dom';
import App from './components/App';
import reportWebVitals from './reportWebVitals';
import './styles/normalize.css';
import { Controller } from "redux-lz-controller";
import thunk from 'redux-thunk';
import { applyMiddleware, compose, createStore } from 'redux'
import { Provider } from "react-redux";

import ConfigController from "./controllers/ConfigController";
new ConfigController();

const composes = [
  applyMiddleware(thunk)
];

if (window.__REDUX_DEVTOOLS_EXTENSION__) {
  composes.push(window.__REDUX_DEVTOOLS_EXTENSION__());
}

let rootReducer = Controller.getReducers();

let store = createStore(rootReducer, compose(...composes));
Controller.setStore(store);

ReactDOM.render(
  <React.StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </React.StrictMode>,
  document.getElementById('root')
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
