const Salus = require('./salus')

const find = require('local-devices');
const fetch = require('node-fetch');
const base64 = require('base-64');
const fs = require('fs');
const fetchTimeout = require('fetch-timeout');
const log = require('simple-node-logger').createSimpleLogger({
    timestampFormat:'YYYY-MM-DD HH:mm:ss.SSS'
});
log.setLevel('info')

var rate;
var otemp;
var heatpumpIPs = [];
var control;


let rawdata = fs.readFileSync('.settings/control.json');
control = JSON.parse(rawdata);

salus = new Salus(log, control.general.salus)


// https://github.com/ael-code/daikin-control



const getHeatpumps = () => find(control.general.lan_range).then(async devices => {
    for (let i = 0; i < devices.length; i++) {
        try {
            let response = await fetchTimeout('http://' + devices[i].ip + '/common/basic_info', {
                method: 'GET'
            }, 3000, 'Timeout')
            let isHeatpump = await response.ok

            if (!isHeatpump) {
                throw new Error(devices[i].ip + ': Not a Heat Pump')
            }
            let body = await response.text()
            let res = await toObject(body)
            heatpumpIPs.push({ 'name': decodeURI(res.name), 'ip': devices[i].ip })
        } catch (e) {
           log.debug(e.message);
        }
    }
    return devices
})

const setDevices = async () =>  {
    for (let i = 0; i < control.devices.length; i++) {
        let state = await getDesiredState(control.devices[i].schedule)
        const ip = heatpumpIPs.find(element => element.name == control.devices[i].name).ip
        await setIndividual(state,ip)
    }
}

const setIndividual = async (state,ip) =>  {
    try {
        let response = await fetchTimeout('http://' + ip + '/aircon/set_control_info?pow=1&mode=4&stemp=' + state.temp + '&shum=0&f_rate=A&f_dir=3', {
            method: 'GET'
        }, 10000, 'Timeout')
        let body = await response.text()
    
    } catch (e) {
        log.error(e.message);
    }
}

const turnAllOff = async () =>  {
    for (let i = 0; i < control.devices.length; i++) {
        let ip = heatpumpIPs.find(element => element.name == control.devices[i].name).ip
        try {
            let response = await fetchTimeout('http://' + ip + '/aircon/set_control_info?pow=0&mode=4&stemp=18&shum=0&f_rate=B&f_dir=0', {
                method: 'GET'
            }, 10000, 'Timeout')
            let body = await response.text()
        } catch (e) {
            log.error(e.message);
        }
       
    }
}


const getDesiredState = async (schedule) =>  {
    let now = new Date()
    const found = schedule.find(element => {
        let on = new Date(now.toDateString() + ' ' + element.on)
        let off = new Date(now.toDateString() + ' ' + element.off)
        if ( +off < +on ) {
            off.setDate(off.getDate() + 1);
        }
        return ( +now > +on && +now <= +off )
    })

   return found
}


const toObject = async (body) =>  {
    let arr = body.split(',')
    let rv = {};
    for (var i = 0; i < arr.length; ++i) {
        let rs = arr[i].split('=')
        rv[rs[0]] = rs[1]
    }
    return rv;
}



const getRate = async () => {
    const event = new Date();
    let qd = event.toISOString();
    event.setSeconds(event.getSeconds() + 10);
    let qd1 = event.toISOString()
    let url = 'https://api.octopus.energy/v1/products/AGILE-18-02-21/electricity-tariffs/E-1R-AGILE-18-02-21-J/standard-unit-rates/?period_from=' + qd + '&period_to=' + qd1
    let authString = control.general.apikey + `:`
    await fetch(url, {
        method: 'GET',
        headers: {
            Authorization: 'Basic ' + base64.encode(authString)
        }
    }).then(res => res.json())
        .then(json => {
            rate = json.results[0].value_exc_vat
        })
        .catch(e => log.error(e.message));

}

async function getOutsideTemp() {
    await fetch('http://' + heatpumpIPs[0].ip + '/aircon/get_sensor_info')
        .then( response => response.text() )
        .then(text  =>  toObject(text) )
        .then( res =>  otemp = res.otemp )
        .catch(err => log.error(err))

}

const turnOff = async () => {
    await turnAllOff()
    await salus.login()
    await salus.setAuto()
    await salus.logout()
}


const go = async () => {
    await getHeatpumps()
    await getRate()
    await getOutsideTemp()
    log.info('Price: ' + rate + ' Outside temp:' + otemp )
    if (rate == 'undefined' || rate == 0 || rate == null || rate > control.general.eprice
     || otemp == 'undefined' || otemp == null || otemp > control.general.otemp) {
        await turnOff()
        log.info('Heatpumps off - Gas on')
        return
    }
    await setDevices()
    await salus.login()
    await salus.setOff()
    await salus.logout()
    log.info('Heatpumps on - Gas off')
    process.exit(0)
}
go()