// derived from https://github.com/matthewturner/smartheat-clients/blob/master/clients/Salus.js

const cheerio = require('cheerio');

// Enable cookies
const request = require('request-promise');

const host = 'https://salus-it500.com';

class Salus {
    constructor(log, options) {
        this._log = log;
        this._options = options;
        this._jar = request.jar();
    }

    get credentials() {
        return {
            devId: this._devId,
            token: this._token
        };
    }

    timeString() {
        let dat = new Date();
        let days = (dat.getYear() * 365) + (dat.getMonth() * 31) + dat.getDate();
        return (days * 86400) + ((dat.getUTCHours() * 60) + dat.getUTCMinutes()) * 60 + dat.getUTCSeconds();
    }

    urlTo(page, authenticated = true) {
        let url = `${host}/public/${page}.php`;
        if (authenticated) {
            url += `?devId=${this._devId}&token=${this._token}&_=${this.timeString()}`;
        }
        return url;
    }

    async login() {
        let options = this.options();

        try {
            await request.post(this.urlTo('login', false), options);
            let body = await request.get(this.urlTo('devices', false), {
                jar: this._jar
            });
            let $ = cheerio.load(body);
            this._devId = $('input[name="devId"]').val();
            this._token = $('#token').val();
            this._log.debug('Device: ' + this._devId + ' Token: ' + this._token)
        } catch (error) {
        
        }
    }

    /**
     * Returns the options for the web
     * request including the form, jar
     * and redirect behaviour
     */
    options() {
        return {
            form: {
                'IDemail': this._options.username,
                'password': this._options.password,
                'login': 'Login'
            },
            jar: this._jar,
            followRedirect: true,
            simple: false
        };
    }
    
    async setAuto() {
        let options = {
            form: {
                'token': this._token,
                'auto': 0,
                'devId': this._devId,
                'auto_setZ1': 1
            },
            jar: this._jar
        };
        await request.post(`${host}/includes/set.php`, options);
    }

    async setOff() {
        let options = {
            form: {
                'token': this._token,
                'auto': 1,
                'devId': this._devId,
                'auto_setZ1': 1
            },
            jar: this._jar
        };
        await request.post(`${host}/includes/set.php`, options);
    }

    async logout() {
        await request.get(this.urlTo('logout', false), {
            jar: this._jar
        });
    }
}

module.exports = Salus