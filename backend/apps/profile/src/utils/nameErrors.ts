const	NAME_RULE = 'it may only contain letters, with single spaces, hyphens or apostrophes between parts';

// Maps the profiles_*_name_format_check CHECKs (002_profiles.sql), where the name rule lives, to the
// message the user sees. null when the error is anything else.
export function	getInvalidNameMessage(error: any): string | null
{
	if (!error || error.code !== '23514')
		return (null);

	if (error.constraint === 'profiles_first_name_format_check')
		return (`Invalid first name: ${NAME_RULE}`);

	if (error.constraint === 'profiles_last_name_format_check')
		return (`Invalid last name: ${NAME_RULE}`);

	return (null);
}
