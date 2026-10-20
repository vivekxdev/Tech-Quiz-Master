// Bridge module for the admin experience harness.
//
// React, react-dom and react-router-dom are loaded from *this* file so they
// resolve against admin/node_modules — exactly like the admin components the
// harness SSR-loads. Sharing one instance of each library is what keeps the
// Router context (and the reconciler) in sync between the test and the
// components under test.
import * as ReactNamespace from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Routes, Route, Link } from "react-router-dom";

export const React = ReactNamespace.default ?? ReactNamespace;
export { createRoot, MemoryRouter, Routes, Route, Link };
