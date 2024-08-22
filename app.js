// // express is the framework being used for nodejs
const express = require("express");
const app = express();
const dotenv = require("dotenv");
var bodyParser = require("body-parser");
const cors = require("cors");

dotenv.config({ path: "./config/config.env" });

// set cors to only accept
const options = {
  origin: process.env.CORSORIGIN.split(","),
  credentials: true
};

app.use(cors(options));
app.use(bodyParser.json());

app.use((req, res, next) => {
  let legalpath = false;

  if (req.method === "POST") {
    if (req.path === "/CreateTask" || req.path === "/GetTaskbyState") {
      legalpath = true;
    }
  } else if (req.method === "PATCH") {
    if (req.path === "/PromoteTask2Done") {
      legalpath = true;
    }
  }
  if (legalpath) {
    next();
  } else {
    console.log(`Error, Method: ${req.method}, Path: ${req.path}`);
    return res.status(400).json({
      code: "E_VU1"
    });
  }
});

const controller = require("./controller/controller");

app.use(controller);

const PORT = process.env.PORT;
app.listen(PORT, () => {
  console.log(`Server started on port ${process.env.PORT}`);
});
