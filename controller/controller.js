const express = require("express");
const dotenv = require("dotenv");
const router = express.Router();
const bcrypt = require("bcryptjs");

const transporter = require("../config/email"); // Import your transporter configuration
dotenv.config({ path: "./config/config.env" });
const { getConnectionPool } = require("../config/database");

const CreateTask = async (req, res) => {
  console.log("CreateTask Called");
  const pool = getConnectionPool();
  const requestdata = await req.body;

  const params = ["username", "password", "app_acronym", "task_name", "task_description"];

  console.log("value of username: " + requestdata.username);
  console.log("value of password: " + requestdata.password);
  console.log("value of app_acronym: " + requestdata.app_acronym);
  console.log("value of task_name: " + requestdata.task_name);
  console.log("value of task_description: " + requestdata.task_description);

  // verify that fields exist, if any of the fields are missing then return
  if (!requestdata.username || !requestdata.password || !requestdata.app_acronym || !requestdata.task_name) {
    console.log("One of the fields are missing");
    res.status(400).json({
      code: "E_SP1"
    });
    return;
  }

  const username = requestdata.username.toLowerCase();
  const password = requestdata.password;
  const app_acronym = requestdata.app_acronym.toLowerCase();
  const task_name = requestdata.task_name;

  if (username.length < 1 || app_acronym.length < 1 || task_name.length < 1 || password.length < 1) {
    console.log("One of the mandatory fields are empty");
    res.status(400).json({
      code: "E_SP1"
    });
    return;
  }

  // Get the keys from requestdata
  const requestKeys = Object.keys(requestdata);
  // Find the extra keys
  const extraKeys = requestKeys.filter(key => !params.includes(key));

  if (extraKeys.length > 0) {
    console.log("Extra keys: " + extraKeys.length);
    console.log("Additional Fields detected");
    res.status(400).json({
      code: "E_SP2"
    });
    return;
  }

  let connection;

  try {
    connection = await pool.getConnection();
  } catch (error) {
    console.log(error);
    if (error.errno === 1045 || error.errno === 1049 || error.errno === 1049) {
      console.log("Could not connect to database");
      res.status(500).json({
        code: "E_TE1"
      });
      return;
    } else {
      console.log("Unknown database error");
      console.log(error);
      res.status(500).json({
        code: "E_TE4"
      });
      return;
    }
  }

  try {
    await connection.beginTransaction();
    const userstatement = `SELECT user.password, user.disabled FROM user WHERE user.username = ?`;
    const userparams = [username];
    const [userresult] = await connection.query(userstatement, userparams);
    if (userresult.length !== 1) {
      // invalid username
      console.log("User doesn't exists (Invalid User)");
      res.status(401).json({
        code: "E_AU1"
      });
      return;
    }
    const passwordMatch = await bcrypt.compare(password, userresult[0].password);

    // second point of failure, password is incorrect
    if (!passwordMatch) {
      console.log("Wrong password");
      res.status(401).json({
        code: "E_AU2"
      });
      return;
    }
    // console.log("user is disabled is: " + userresult[0].disabled);
    if (userresult[0].disabled) {
      console.log("User is disabled");
      res.status(403).json({
        code: "E_AU3"
      });
      return;
    }
    await connection.commit();
  } catch (error) {
    console.log("Unknown database error");
    console.log(error);
    await connection.rollback();
    connection.release();
    res.status(500).json({
      code: "E_TE4"
    });
    return;
  }
  console.log("User Successfully Logged In");

  // make a call to backend database to get the application data for the task
  try {
    const appstatement = `SELECT * FROM application where application.app_acronym = ?`;
    const appparams = [app_acronym];
    const [appresult] = await connection.query(appstatement, appparams);
    if (appresult.length !== 1) {
      // invalid application acronym
      console.log("app_acronym does not exist: " + app_acronym);
      res.status(500).json({
        code: "E_TE2"
      });
      return;
    }

    // acquire the permissions, check app_permit_create
    // check the groups that the user belongs to
    const usergroupstatement = `SELECT usergroup.groupname FROM usergroup WHERE usergroup.username = ?`;
    const usergroupparams = [username];
    const [usergroupresult] = await connection.query(usergroupstatement, usergroupparams);
    const usergroups = usergroupresult.map(item => item.groupname);

    if (!usergroups.includes(appresult[0].app_permit_create)) {
      console.log(username + " does not have permissions for application: " + app_acronym + " which only permits task creation for groups: " + appresult[0].app_permit_create);
      res.status(403).json({
        code: "E_AR1"
      });
      return;
    }

    const rawdate = new Date();

    const year = rawdate.getFullYear();
    const month = String(rawdate.getMonth() + 1).padStart(2, "0"); // Months are zero-based
    const day = String(rawdate.getDate()).padStart(2, "0");
    const hours = String(rawdate.getHours()).padStart(2, "0");
    const minutes = String(rawdate.getMinutes()).padStart(2, "0");
    const seconds = String(rawdate.getSeconds()).padStart(2, "0");

    const task_createDate = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;

    const trimmed_task_name = task_name.trim();
    let task_description = requestdata.task_description;
    const task_id = app_acronym + "_" + appresult[0].app_rnumber;
    const task_state = "open";
    const task_plan = null;
    const task_app_Acronym = app_acronym;
    const task_creator = username;
    const task_owner = username;

    if (!task_description) {
      task_description = "";
    }

    // after trimming any white spaces, there is no length left
    if (trimmed_task_name.length < 1) {
      console.log("after removing white spaces task_name is empty, before: " + task_name + " , length: " + task_name.length + " after: " + trimmed_task_name + ", length: " + trimmed_task_name.length);
      return res.status(400).json({
        code: "E_TE2"
      });
    }

    // console.log("task_name: " + task_name);
    // console.log("task_description: " + task_description);
    // console.log("task_id: " + task_id);
    // console.log("task_state: " + task_state);
    // console.log("task_createDate: " + task_createDate);
    // console.log("task_plan: " + task_plan);
    // console.log("task_app_Acronym: " + task_app_Acronym);
    // console.log("task_creator: " + task_creator);
    // console.log("task_owner: " + task_owner);

    //create task
    const createnewtaskstatement = `INSERT INTO task 
    (task_name, task_description, task_id, task_state, task_createDate,task_plan, task_app_Acronym, task_creator,task_owner) 
      VALUES (?,?,?,?,?,?,?,?,?);`;
    // we perform the lower case conversion here because we know the variables are valid and will not crash because they dont exist
    const createnewtaskparams = [trimmed_task_name, task_description, task_id, task_state, task_createDate, task_plan, task_app_Acronym, task_creator, task_owner];

    const [createnewtaskresult] = await connection.query(createnewtaskstatement, createnewtaskparams);

    if (createnewtaskresult.affectedRows === 0) {
      console.log("failed to create task");
      console.log("Unknown database error");
      console.log(error);
      await connection.rollback();
      res.status(500).json({
        code: "E_TE4"
      });
      return;
    }

    //create task
    const newtasknotestatement = `INSERT INTO tasknote 
    (task_id, notes, tasknote_created) 
      VALUES (?,?,?);`;
    const notes = `[System, ${task_state}] task created by ${task_creator}, ${task_createDate}`;
    // user, current state, date & time, note
    // we perform the lower case conversion here because we know the variables are valid and will not crash because they dont exist
    const newtasknoteparams = [task_id, notes, task_createDate];
    const [newtasknoteresult] = await connection.query(newtasknotestatement, newtasknoteparams);

    if (newtasknoteresult.affectedRows === 0) {
      console.log("failed to create tasknote");
      console.log("Unknown database error");
      console.log(error);
      await connection.rollback();
      res.status(500).json({
        code: "E_TE4"
      });
      return;
    }

    // successfully created task need to update the rnumber value in application
    //     UPDATE your_table_name
    const updaternumberstatement = `UPDATE application SET app_rnumber = ? WHERE app_acronym = ?`;
    // user, current state, date & time, note
    // we perform the lower case conversion here because we know the variables are valid and will not crash because they dont exist
    const updaternumberparams = [appresult[0].app_rnumber + 1, app_acronym];
    const [updaternumberresult] = await connection.query(updaternumberstatement, updaternumberparams);

    if (updaternumberresult.affectedRows === 0) {
      console.log("failed to update application number");
      console.log("Unknown database error");
      console.log(error);
      res.status(500).json({
        code: "E_TE4"
      });
      await connection.rollback();
      return;
    }

    await connection.commit();
    res.status(200).json({
      task_id: task_id,
      code: "S_001"
    });
    console.log("successfully created a task");
    return;
  } catch (error) {
    // checkf for erno 1406
    if (error.errno === 1406) {
      console.log("data too long for column");
      console.log(error);
      res.status(500).json({
        code: "E_TE2"
      });
    } else {
      console.log("Unknown database error");
      console.log(error);
      res.status(500).json({
        code: "E_TE4"
      });
    }
    await connection.rollback();
    return;
  } finally {
    connection.release();
  }
};

const GetTaskByState = async (req, res) => {
  console.log("GetTaskByState Called");
  const pool = getConnectionPool();
  const requestdata = await req.body;

  console.log("requestdata.username: " + requestdata.username);
  console.log("requestdata.password: " + requestdata.password);
  console.log("requestdata.task_state: " + requestdata.task_state);

  if (!requestdata.username || !requestdata.password || !requestdata.task_state) {
    console.log("One of the fields are missing");
    res.status(400).json({
      code: "E_SP1"
    });
    return;
  }

  // make a call to backend database to make sure that the user exist
  const username = requestdata.username.toLowerCase();
  const password = requestdata.password;
  const task_state = requestdata.task_state.toLowerCase();

  // console.log("username " + username);
  // console.log("password " + password);
  // console.log("task_state " + task_state);

  if (username.length < 1 || password.length < 1 || task_state.length < 1) {
    console.log("One of the mandatory fields are empty");
    res.status(400).json({
      code: "E_SP1"
    });
    return;
  }

  const params = ["username", "password", "task_state"];
  // Get the keys from requestdata
  const requestKeys = Object.keys(requestdata);
  // Find the extra keys
  const extraKeys = requestKeys.filter(key => !params.includes(key));

  if (extraKeys.length > 0) {
    console.log("Extra keys: " + extraKeys.length);
    console.log("Additional Fields detected");
    res.status(400).json({
      code: "E_SP2"
    });
    return;
  }

  let connection;
  try {
    connection = await pool.getConnection();
  } catch (error) {
    if (error.errno === 1045 || error.errno === 1046 || error.errno === 1049) {
      console.log("Could not connect to database");
      res.status(500).json({
        code: "E_TE1"
      });
      return;
    } else {
      console.log("Unknown database error");
      console.log(error);
      res.status(500).json({
        code: "E_TE4"
      });
      return;
    }
  }

  // console.log("value of username: " + requestdata.username);
  // console.log("value of password: " + requestdata.password);
  // console.log("value of task_state: " + requestdata.task_state);
  // verify that fields exist, if any of the fields are missing then return

  // checking username and password
  try {
    await connection.beginTransaction();
    const userstatement = `SELECT user.password, user.disabled FROM user WHERE user.username = ?`;
    const userparams = [username];
    const [userresult] = await connection.query(userstatement, userparams);
    if (userresult.length !== 1) {
      // invalid username
      console.log("Username doesnt exist in database");
      res.status(401).json({
        code: "E_AU1"
      });
      return;
    }
    const passwordMatch = await bcrypt.compare(password, userresult[0].password);
    // second point of failure, password is incorrect
    if (!passwordMatch) {
      console.log("Password is incorrect");
      res.status(401).json({
        code: "E_AU2"
      });
      return;
    }
    if (userresult[0].disabled) {
      console.log("User is disabled");
      res.status(403).json({
        code: "E_AU3"
      });
      return;
    }
    await connection.commit();
  } catch (error) {
    console.log("Unknown database error");
    console.log(error);
    res.status(500).json({
      code: "E_TE4"
    });
    await connection.rollback();
    connection.release();
    return;
  }
  console.log("User Successfully Logged In");
  const legal_states = ["open", "todo", "doing", "done", "closed"];
  let legaltaskstate = false;

  if (task_state) {
    if (legal_states.includes(task_state.toLowerCase())) {
      legaltaskstate = true;
    }
  }

  if (!legaltaskstate) {
    console.log("illegal task state detected");
    res.status(400).json({
      code: "E_TE2"
    });
    return;
  }

  try {
    const taskstatestatement = `SELECT * FROM task WHERE task.task_state = ?`;
    const taskstateparams = [task_state];
    const [taskstateresult] = await connection.query(taskstatestatement, taskstateparams);

    taskstateresult.forEach(task => {
      //const localDate = new Date(task.task_createDate).toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' });
      task.task_createDate = new Date(task.task_createDate).toLocaleDateString("en-CA", { timeZone: "Asia/Singapore" });
      //task.task_createDate = task.task_createDate.toISOString().split("T")[0];
    });

    console.log(taskstateresult);
    //console.log(taskstateresult);
    await connection.commit();
    res.status(200).json({
      task: taskstateresult,
      code: "S_001"
    });
    return;
  } catch (error) {
    console.log(error);
    await connection.rollback();
    res.status(500).json({
      code: "E_TE4"
    });
  } finally {
    connection.release();
  }
};

const PromoteTask2Done = async (req, res) => {
  console.log("PromoteTask2Done Called");
  const pool = getConnectionPool();
  const requestdata = await req.body;

  if (!requestdata.username || !requestdata.password || !requestdata.task_id || !requestdata.note) {
    console.log("One of the fields are missing");
    res.status(400).json({
      code: "E_SP1"
    });
    return;
  }

  const username = requestdata.username.toLowerCase();
  const password = requestdata.password;
  const task_id = requestdata.task_id;

  if (username.length < 1 || task_id.length < 1 || password.length < 1 || password.note < 1) {
    console.log("One of the mandatory fields are empty");
    res.status(400).json({
      code: "E_SP1"
    });
    return;
  }

  const params = ["username", "password", "task_id", "note"];
  // Get the keys from requestdata
  const requestKeys = Object.keys(requestdata);
  // Find the extra keys
  const extraKeys = requestKeys.filter(key => !params.includes(key));
  //console.log("Extra keys: " + extraKeys.length);
  if (extraKeys.length > 0) {
    console.log("Additional Fields detected");
    res.status(400).json({
      code: "E_SP2"
    });
    return;
  }

  let connection;
  try {
    connection = await pool.getConnection();
  } catch (error) {
    console.log(error);
    if (error.errno === 1045 || error.errno === 1049 || error.errno === 1049) {
      console.log("Could not connect to database");
      res.status(500).json({
        code: "E_TE1"
      });
      return;
    } else {
      console.log("Unknown database error");
      console.log(error);
      res.status(500).json({
        code: "E_TE4"
      });
      return;
    }
  }

  // checking username and password
  try {
    await connection.beginTransaction();
    const userstatement = `SELECT user.password, user.disabled FROM user WHERE user.username = ?`;
    const userparams = [username];
    const [userresult] = await connection.query(userstatement, userparams);
    if (userresult.length !== 1) {
      // invalid username
      console.log("Username doesnt exist in database");
      res.status(401).json({
        code: "E_AU1"
      });
      return;
    }
    const passwordMatch = await bcrypt.compare(password, userresult[0].password);

    // second point of failure, password is incorrect
    if (!passwordMatch) {
      console.log("Password is incorrect");
      res.status(401).json({
        code: "E_AU2"
      });
      return;
    }
    if (userresult[0].disabled) {
      console.log("User is disabled");
      res.status(403).json({
        code: "E_AU3"
      });
      return;
    }
    await connection.commit();
  } catch (error) {
    console.log("Unknown database error");
    console.log(error);
    await connection.rollback();
    connection.release();
    res.status(500).json({
      code: "E_TE4"
    });
    return;
  }
  console.log("User Successfully Logged In");

  //console.log(task_id);
  // check the status of the task
  try {
    await connection.beginTransaction();
    const originaltaskstatement = "SELECT * FROM task where task_id = ?";
    const originaltaskparams = [task_id];
    const [originaltaskresult] = await connection.query(originaltaskstatement, originaltaskparams);
    //console.log(originaltaskresult);
    if (originaltaskresult.length !== 1) {
      res.status(400).json({
        code: "E_TE2"
      });
      connection.release();
      return;
    }
    const originaltask = originaltaskresult[0];
    // need to check if the state change is legal, originaltask.task_state
    //originaltask.task_app_Acronym
    const applicationstatement = "SELECT * FROM application where app_acronym = ?";
    const applicationparams = [originaltask.task_app_Acronym];
    const [applicationresult] = await connection.query(applicationstatement, applicationparams);
    if (applicationresult.length !== 1) {
      res.status(400).json({
        code: "E_TE2"
      });
      connection.release();
      return;
    }
    const currentapplication = applicationresult[0];
    const usergroupstatement = "SELECT usergroup.groupname FROM usergroup where usergroup.username = ?";
    const usergroupparams = [username];
    const [usergroupresult] = await connection.query(usergroupstatement, usergroupparams);
    const usergrouparray = usergroupresult.map(item => item.groupname);
    // now we must check if the person making the changes have the permssions to change it
    switch (originaltask.task_state) {
      case "doing":
        //console.log("original task is doing");
        if (!usergrouparray.includes(currentapplication.app_permit_doing)) {
          console.log("Current user has no permissions to change a task in doing state! ");
          res.status(403).json({
            code: "E_AR1"
          });
          connection.release();
          return;
        }
        break;
      default:
        console.log("Task is in unknown state could not verify permissions! ");
        res.status(400).json({
          code: "E_TE3"
        });
        connection.release();
        return;
    }
    // now we check for every possible state change, this is needed to ensure that the change is legal, also we need to add into audit trail
    let newaudittrail = "";
    const rawdate = new Date();
    const year = rawdate.getFullYear();
    const month = String(rawdate.getMonth() + 1).padStart(2, "0"); // Months are zero-based
    const day = String(rawdate.getDate()).padStart(2, "0");
    const hours = String(rawdate.getHours()).padStart(2, "0");
    const minutes = String(rawdate.getMinutes()).padStart(2, "0");
    const seconds = String(rawdate.getSeconds()).padStart(2, "0");
    const timestamp = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    const finalstate = "done";

    if (originaltask.task_state === "doing" && finalstate === "done") {
      newaudittrail = "[System, done] task submitted by " + username + ", " + timestamp;

      // now add the audit trail message to the tasknotes
      const audittrailstatement = `INSERT INTO tasknote (task_id, notes, tasknote_created) VALUES (?,?,?);`;
      const audittrailparams = [task_id, newaudittrail, timestamp];
      const [audittrailresult] = await connection.query(audittrailstatement, audittrailparams);
    }
    // console.log("targeted end state: " + finalstate);
    // console.log("targeted newtaskstate: " + newtaskstate);
    let newtasknotes = "";
    if (requestdata.note) {
      newtasknotes = requestdata.note;
    }
    // adding notes, only need to add if there is anything
    if (newtasknotes.length > 0) {
      // so that there is not clash of unique key in task notes
      let additionalseconds = String(rawdate.getSeconds() + 1).padStart(2, "0");
      // if 59 seconds, cannot increment by 1s because it will be 60s which is illegal
      if (rawdate.getSeconds() === 59) {
        additionalseconds = String(rawdate.getSeconds() - 1).padStart(2, "0");
      }
      const forwardtimestamp = `${year}-${month}-${day} ${hours}:${minutes}:${additionalseconds}`;
      // now add the audit trail message to the tasknotes
      const newnotestatement = `INSERT INTO tasknote (task_id, notes, tasknote_created) VALUES (?,?,?);`;
      const tasknotewithsystemmessage = `[${username}'s comment, ${finalstate}] ${forwardtimestamp}\n${newtasknotes}\n`;
      //console.log(tasknotewithsystemmessage);
      // adding the prefix for notes [user's comment, state] datetime + \n
      //const newnoteparams = [taskid, tasknotewithsystemmessage, timestamp];
      const newnoteparams = [task_id, tasknotewithsystemmessage, forwardtimestamp];
      const [newnoteresult] = await connection.query(newnotestatement, newnoteparams);
      console.log("Note added: " + newtasknotes);
    }
    // only update the state and task ownder if there is a state change
    if (newaudittrail.length > 0) {
      const updatetaskstatestatement = `UPDATE task SET task_state = ?, task_owner =? WHERE task_id = ?`;
      const updatetaskstateparams = [finalstate, username, task_id];
      const [updatetaskstateresult] = await connection.query(updatetaskstatestatement, updatetaskstateparams);
      // reach here only if there are no errors with updating the state change
      // send an email to everyone in the application "done group"
      if (finalstate === "done" && originaltask.task_state === "doing") {
        // getting all users that are in the done group...
        const doneuserstatestatement = `SELECT username FROM usergroup WHERE groupname = ?`;
        // params need to check the application, what is the group that is allowed to edit done task, currentapplication.app_permit_done
        const doneuserstateparams = [currentapplication.app_permit_done];
        const [doneuserstateresult] = await connection.query(doneuserstatestatement, doneuserstateparams);
        //console.log("All users that permissions for task DONE");
        //console.log(doneuserstateresult);
        const usernamelist = doneuserstateresult.map(row => row.username);
        //console.log(usernamelist);
        const doneuseremailstatestatement = `SELECT email FROM user WHERE username IN (?)`;
        // params need to check the application, what is the group that is allowed to edit done task, currentapplication.app_permit_done
        const doneuseremailstateparams = [usernamelist];
        const [doneuseremailstateresult] = await connection.query(doneuseremailstatestatement, doneuseremailstateparams);
        const recipientsarray = doneuseremailstateresult.map(row => row.email);
        const recipientsstring = recipientsarray.join(", ");
        //console.log(recipientsstring);
        const mailOptions = {
          from: process.env.EMAILUSER, // Sender address
          to: recipientsstring, // List of recipients
          subject: "Task: " + originaltask.task_name + " with ID: " + originaltask.task_id + " in Application: " + currentapplication.app_acronym + " is done and ready for review", // Subject line
          text: newaudittrail // Plain text body
        };

        try {
          // const info = await transporter.sendMail(mailOptions);
          // console.log("Email sent: " + info.response);
          transporter.sendMail(mailOptions);
        } catch (error) {
          console.log("Error sending out emails!");
          console.log(error);
          // await connection.rollback();
          // connection.release();
          // return res.status(500).json({ code: "E_TE4" });
        }

        //console.log(doneuseremailstateresult);
        await connection.commit();
        console.log("successful task promotion");
        res.status(200).json({
          code: "S_001"
        });
        return;
      }
    }
  } catch (error) {
    console.log("Unknown database error");
    console.log(error);
    await connection.rollback();
    connection.release();
    res.status(500).json({
      code: "E_TE4"
    });
    return;
  } finally {
    connection.release();
  }
};

router.route("/CreateTask").post(CreateTask);
router.route("/GetTaskByState").post(GetTaskByState);
router.route("/PromoteTask2Done").patch(PromoteTask2Done);

module.exports = router;
