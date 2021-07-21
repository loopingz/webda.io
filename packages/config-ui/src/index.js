import React from 'react';
import ReactDOM from 'react-dom';
import App from './components/App';
import reportWebVitals from './reportWebVitals';

import { Controller } from "redux-lz-controller";
import { createBrowserHistory } from 'history';

import thunk from 'redux-thunk';
import { applyMiddleware, compose, createStore, combineReducers } from 'redux';
import { routerMiddleware, connectRouter } from 'connected-react-router'
import { Provider } from "react-redux";
import { ConnectedRouter } from "connected-react-router";
import { persistReducer } from "redux-persist";
import storage from "redux-persist/lib/storage";

import ConfigController from "./controllers/ConfigController";
new ConfigController();

export const history = createBrowserHistory();

const composes = [
  applyMiddleware(
    routerMiddleware(history)
  ),
  applyMiddleware(thunk)
];

if (window.__REDUX_DEVTOOLS_EXTENSION__) {
  composes.push(window.__REDUX_DEVTOOLS_EXTENSION__());
}

const persistConfig = {
  key: "root",
  storage: storage,
  blacklist: ["notifications"]
};

let rootReducer = Controller.getReducers();
rootReducer = persistReducer(persistConfig, rootReducer);

let store = createStore(
  combineReducers({ rootReducer, router: connectRouter(history) }),
  compose(...composes)
);

Controller.setStore(store);

ReactDOM.render(
  <React.StrictMode>
    <Provider store={store}>
      <ConnectedRouter history={history}>
        <App />
      </ConnectedRouter>
    </Provider>
  </React.StrictMode>,
  document.getElementById('root')
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
