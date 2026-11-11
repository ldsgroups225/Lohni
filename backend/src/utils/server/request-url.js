const { parse: parseQuery } = require('node:querystring');

function parseRequestTarget(target) {
    const value = target || '/';
    const url = new URL(value.startsWith('/') ? `http://localhost${value}` : value, 'http://localhost');
    const withoutAuthority = value.replace(/^[a-z][a-z\d+.-]*:\/\/[^/?#]*/i, '');
    const pathname = withoutAuthority.split(/[?#]/, 1)[0].replace(/\\/g, '/') || '/';
    return { pathname, query: parseQuery(url.search.slice(1)) };
}

module.exports = parseRequestTarget;
