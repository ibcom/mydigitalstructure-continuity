/*
	mydigitalstructure Continuity example app for an organisation;
	- https://docs.mydigitalstructure.cloud/gettingstarted_continuity

	Design Notes:

	# You need to set up a user role with access to:
	LOGON, CORE_GET_USER_DETAILS, CORE_DATA_TRACKING_SEARCH, SETUP_SPACE_SETTINGS_SEARCH, SETUP_SPACE_SETTINGS_MANAGE
	& any data objects that you want to back up.
	
  	To run local use https://www.npmjs.com/package/lambda-local:

	lambda-local -l index.js -t 9000 -e event-continuity-get-last-backup-date.json
	 - Get last back up date

	lambda-local -l index.js -t 9000 -e event-continuity-get-tracking-data.json
	 - Get tracking data

	Dependancies:

	# Port scanner:
	https://www.npmjs.com/package/evilscan

	# DNS Look up:
	https://www.npmjs.com/package/dns-lookup

	Notes:

	# context: this the context of the lambda job runtime info
*/

exports.handler = function (event, context, callback)
{
	var mydigitalstructure = require('mydigitalstructure')
	var _ = require('lodash')
	var moment = require('moment');

	mydigitalstructure.set(
	{
		scope: '_event',
		value: event
	});

	mydigitalstructure.init(main);

	function main(err, data)
	{
		mydigitalstructure.add(
		{
			name: 'continuity-start',
			code: function (param)
			{
				var event = mydigitalstructure.get(
				{
					scope: '_event'
				});

				var controller;

				if (_.isObject(event))
				{
					controller = event.controller;
				}

				if (controller != undefined)
				{
					mydigitalstructure._util.message(
					[
						'-',
						'Using mydigitalstructure module version ' + mydigitalstructure.VERSION,
						'-',
						'Based on event data invoking controller:',
						controller
					]);

					mydigitalstructure.invoke(controller);
				}
			}
		});

		//--- GET LAST BACKUP REFERENCE DATE FROM YOUR SPACE SETTINGS

		mydigitalstructure.add(
		[
			{
				name: 'continuity-get-last-backup-date',
				code: function (param)
				{
					mydigitalstructure.cloud.search(
					{
						object: 'setup_space_settings',
						fields: 'datatrackinglastbackupdate',
						callback: 'continuity-get-last-backup-date-response',
						callbackParam: param
					});
				}
			},
			{
				name: 'continuity-get-last-backup-date-response',
				code: function (param, response)
				{
					if (response.status == 'OK')
					{
						var lastBackupDate = mydigitalstructure.set(
						{
							scope: 'continuity-get-last-backup-date',
							value: _.first(response.data.rows).datatrackinglastbackupdate
						}

						mydigitalstructure._util.message(
						[
							'-',
							'Last backup date:',
							lastBackupDate
						]);
					}
				}
			}
		]);

		//--- GET TRACKING DATA FROM MYDS

		mydigitalstructure.add(
		[
			{
				name: 'continuity-get-tracking-data',
				code: function (param)
				{
					var settings = mydigitalstructure.get(
					{
						scope: '_settings'
					});
				}
			},
			{
				name: 'continuity-get-tracking-data-response',
				code: function (param, response)
				{
					if (response.status == 'OK')
					{}

					//Now that you have data - save to your own data store - ie AWS S3, DynamoDB ....
				}
			}
		]);

	

		mydigitalstructure.invoke('continuity-start');
	}
}