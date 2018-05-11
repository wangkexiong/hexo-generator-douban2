
'use strict';

exports.is_positive_integer = function(data) {
    return (data === parseInt(data, 10) && data > 0);
}
