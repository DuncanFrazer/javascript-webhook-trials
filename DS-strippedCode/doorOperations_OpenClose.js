const DSHelper = require('./../helpers/DSHelper');

/**
 * Execute "Door Trigger" command but works only when door is currently closed.
 * @returns 204 on success, 409 if door is not closed, 503 in case of Device Server error.
 *
 */
exports.doorOpen = function (req, res) {
    console.log("Door open command received.");
    if (config.lock_webhook && locked) {
            console.log("Sesame is locked, ignoring Door Open command");
            res.sendStatus(406);
    }
    else {
        clearTimeout(timeout);

        const fullUrl = req.protocol + '://' + req.get('host') + '/doors/open';


        DSHelper.getDoorOpenedOptoClickState(config.client_name)
            .then((value) => {
                if (value === false) {
                    console.log("Door already opened. Skipping.");
                    throw new Errors.AlreadyOpenedError();
                }
                return DSHelper.getDoorClosedOptoClickState(config.client_name);
            })
            .then((value) => {
                if (value === true) {
                    console.log("Door not closed. Skipping.");
                    throw new Errors.InvalidDoorStateError();
                }
                return DBHelper.insertOrUpdateConfig(DBConsts.lastDoorCommandKey, DBConsts.doorCommands.open);
            })
            .then( () => {
                return DSHelper.doorOperate(config.client_name);
            })
            .then( () => {
                return DBHelper.addNewAction(Date.now(), DBConsts.statActions.open);
            })
            .then(() => {
                return DSHelper.getDoorOpenCounterValue(config.client_name);
            })
            .then((counter) => {
                setTimeout(doorTimeout, 10000);
                Utils.sendJsonResponse(res, 200,
                    {
                        'links': [
                            {
                                'rel': 'reset',
                                'href': fullUrl + '/reset'
                            }
                        ],
                        'count': counter
                    });
            })
            .catch((error) => {
                if (error instanceof Errors.AlreadyOpenedError) {
                    res.sendStatus(405);
                } else if (error instanceof Errors.InvalidDoorStateError) {
                    res.sendStatus(405);
                }
                else {
                    console.error('Failed to perform "Door Open" command. %s', error);
                    res.sendStatus(406);
                }
            });
    }
};

/**
 * Execute "Door Trigger" command but works only when door is currently opened.
 * @returns 204 on success, 409 if door is not opened, 503 in case of Device Server error.
 *
 */
exports.doorClose = function (req, res) {
    clearTimeout(timeout);
    const fullUrl = req.protocol + '://' + req.get('host') + '/doors/close';

    DSHelper.getDoorClosedOptoClickState(config.client_name)
        .then((value) => {
            if (value === false) {
                console.log("Door already closed. Skipping.");
                return Promise.reject(new Errors.AlreadyClosedError());
            }
            return DSHelper.getDoorOpenedOptoClickState(config.client_name);
        })
        .then((value) => {
            if (value === true) {
                console.log("Door not opened. Skipping.");
                throw new Errors.InvalidDoorStateError();
            }
            return DBHelper.insertOrUpdateConfig(DBConsts.lastDoorCommandKey, DBConsts.doorCommands.close);
        })
        .then(() => {
            return DSHelper.doorOperate(config.client_name);
        })
        .then( () => {
            return DBHelper.addNewAction(Date.now(), DBConsts.statActions.close);
        })
        .then(() => {
            return DSHelper.getDoorCloseCounterValue(config.client_name);
        })
        .then((counterValue) => {
            timeout = setTimeout(doorTimeout, 10000);
            Utils.sendJsonResponse(res, 200,
                {
                    'links': [
                        {
                            'rel': 'reset',
                            'href': fullUrl + '/reset'
                        }
                    ],
                    'count': counterValue
                });
        })
        .catch((error) => {
            if (error instanceof Errors.AlreadyClosedError) {
                res.sendStatus(405);
            } else if (error instanceof Errors.InvalidDoorStateError) {
                res.sendStatus(405);
            } else {
                console.log('Failed to perform "Door Close" operation. %s', error);
                res.sendStatus(406);
            }
        });

};

var doorTimeout = function() {
  DBHelper.getConfigValue(DBConsts.lastDoorCommandKey)
      .then((value) => {
        if (value == DBConsts.doorCommands.open || value == DBConsts.doorCommands.close) {
            Ifttt.notifyDoorStuck();
            return DBHelper.insertOrUpdateConfig(DBConsts.lastDoorCommandKey, DBConsts.doorCommands.none);
        }
      })
      .catch(() => {

      });
};
