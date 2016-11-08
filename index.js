'use strict';

const Website = require('../../server/classes/website');
const Promise = require('bluebird');
const debug = require('debug')('sawmon:plugin:vhosts');



function parseApacheConfig (apacheConfig){
    // Split all virtual hosts
    var virtualHosts = apacheConfig.split('<VirtualHost');

    // Delete everything before the first virtualhost
    virtualHosts.shift();

    return virtualHosts.map(function(virtualHost){
        var vh = {
            domains: [],
            root: undefined
        };
        virtualHost.split('\n').forEach(function(line){
            var split = line.trim().split(' ');
            if(split[0] == 'ServerName' || split[0] == 'ServerAlias'){
                split.shift();
                Array.prototype.push.apply(vh.domains, split);
            }
            else if(split[0] == 'DocumentRoot'){
                vh.root = split[1];
            }
        });

        if(!vh.root) {
            console.log('No root found!', virtualHost);
        }
        return vh;
    });
}


module.exports.dependencies = ['sawmon-ssh'];

module.exports.servers = {};

module.exports.servers.schema = {
    vhosts: String
};

module.exports.servers.display = [
    {
        name: 'Virtual hosts path',
        value: website => (website.toJSON().vhosts ? `${website.toJSON().vhosts}` : null)
    }
];

module.exports.servers.fields = [
    {
        name: 'Virtual hosts path',
        key: 'vhosts',
        type: 'text',
        placeholder: '/etc/apache2/sites-enabled'
    }
];

/**
 * Get all apache files in the vhosts folder
 */
module.exports.servers.refresh = passTrough => {

    debug('Getting vhosts..');

    const vhostsPath = passTrough.instance.toJSON().vhosts;

    if (!vhostsPath) return Promise.resolve();

    return passTrough.getSshConnection()
        .then(ssh => ssh.execCommand('cat *', {cwd: vhostsPath}))
        .then(apacheConfig => {

            /**
             * Parse all apache files
             */
            const virtualHosts = parseApacheConfig(apacheConfig.stdout);

            return Promise.map(virtualHosts, virtualHost => {
                return Promise.map(virtualHost.domains, domain => {

                    const website = {
                        domain: domain,
                        server: passTrough.instance.toJSON()._id,
                        root: virtualHost.root
                    };

                    debug(`Website found: ${website.domain}`);

                    return Website.findOneAndUpdate(website, website, {upsert: true}).exec();

                }, {concurrency: 1});

            }, {concurrency: 1});

        }).catch(error => {

            debug(error);

        });

};
