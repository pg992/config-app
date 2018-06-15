'use strict';
const conf = require('./conf.json');
const prompt = require('prompt-sync')();
const request = require('request');
const async = require('async');
const readlineSync = require('readline-sync');
const util = require('util')
const ini = require('ini');
const fs = require('fs');
const os = require('os');
const path = require('path');
const mkdirp = require('mkdirp');

//Comment this line if we deal with CA signed certificates
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

var apiEndpoint = conf.apiEndpoint;

async.waterfall([
    getUserCredentials,
    getAvailableAccounts,
    getAvailableRolesForAccount,
    getCredentials,
    writeCredentials
], function(err, result) {
    if (err)
        console.log('Error:', err);
    else
        console.log(result);
});


function getUserCredentials(next) {
    var username = prompt('Enter username:', '');
    var password = prompt('Enter password:', '', {
        'echo': '*'
    });
    next(null, username, password);
}

function getAvailableAccounts(username, password, next) {
    request.get({
        url: apiEndpoint + '/available-accounts',
    }, function(err, response, accounts) {
        if (err || response.statusCode != 200) {
            err = err || '';
            let statusCode = response ? response.statusCode : 'unknown';
            next(util.format('Invalid response (%s %d)', err, statusCode));
        } else {
            next(null, username, password, JSON.parse(accounts));
        }
    }).auth(username, password, true);
}

function getAvailableRolesForAccount(username, password, accounts, next) {
    console.log('Available AWS account:');
    let i = 0;
    accounts.forEach(account => console.log('%d) %s', ++i, account.account_description));
    let index = parseInt(readlineSync.question('Choose account:'));
    if (!index || index > accounts.length)
        next('Invalid account, enter some of the values supplied, i.e. 1), 2), 3) etc.');
    else {
        var accountId = accounts[index - 1].account_id;
        request.get({
            url: apiEndpoint + '/available-roles/' + accountId,
        }, function(err, response, roles) {
            if (err || response.statusCode != 200) {
                err = err || '';
                let statusCode = response ? response.statusCode : 'unknown';
                next(util.format('Invalid response (%s %d)', err, statusCode));
            } else {
                next(null, username, password, accountId, JSON.parse(roles));
            }
        }).auth(username, password, true);
    }
}

function getCredentials(username, password, accountId, roles, next) {
    console.log('Available AWS roles for the AWS account chosen:');
    let i = 0;
    roles.forEach(role => console.log('%d) %s', ++i, role.role_name));
    let index = parseInt(readlineSync.question('Choose role:'));
    if (!index || index > roles.length)
        next('Invalid role, enter some of the values supplied, i.e. 1), 2), 3) etc.');
    else {
        let roleId = roles[index - 1].role_id;
        let roleName = roles[index - 1].role_name;
        request.get({
            url: apiEndpoint + '/credentials/' + roleId,
        }, function(err, response, credentials) {
            if (err || response.statusCode != 200) {
                err = err || '';
                let statusCode = response ? response.statusCode : 'unknown';
                next(util.format('Invalid response (%s %d)', err, statusCode));
            } else {
                next(null, username, accountId, roleName, JSON.parse(credentials));
            }
        }).auth(username, password, true);
    }
}

function writeCredentials(username, accountId, roleName, credentials, next) {
    let profileName = util.format('iw_sentinel/%s/%s/%s', accountId, roleName, username);
    profileName = profileName.replace('.', '_');
    const iniPath = util.format('%s%s.aws%scredentials', os.homedir(), path.sep, path.sep);
    let config = {};
    if (fs.existsSync(iniPath))
        config = ini.parse(fs.readFileSync(iniPath, 'utf-8'))

    delete config[profileName];

    config[profileName] = {};
    config[profileName].aws_access_key_id = credentials.AccessKeyId;
    config[profileName].aws_secret_access_key = credentials.SecretAccessKey;
    config[profileName].aws_session_token = credentials.SessionToken;

    const iniContent = ini.encode(config);

    mkdirp.sync(path.dirname(iniPath));

    fs.writeFile(iniPath, iniContent, function(err) {
        if (err) {
            next(util.format('Error saving AWS credentials file [%s]!', iniPath));
        } else {
            next(null, util.format('Profile \'%s\' successfully saved into AWS credentials file \'%s\'.', profileName, iniPath));
        }
    });

}
