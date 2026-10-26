import { BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

// Zxcvbn psw strength estimator 
import { ZxcvbnFactory } from '@zxcvbn-ts/core';
import * as zxcvbnCommon from '@zxcvbn-ts/language-common';
import * as zxcvbnEn from '@zxcvbn-ts/language-en';
import * as zxcvbnIt from '@zxcvbn-ts/language-it';
import * as zxcvbnFr from '@zxcvbn-ts/language-fr';
import * as zxcvbnEs from '@zxcvbn-ts/language-es-es';
import * as zxcvbnDe from '@zxcvbn-ts/language-de';

// The subject rejects "commonly used dictionary words, regardless of language", so the strength
// check knows the common passwords plus the dictionaries of several languages. zxcvbn also sees
// through l33t, capitals, digit suffixes, dates, repeats and keyboard walks, which a plain
// blocklist cannot. Built once: loading the dictionaries is the expensive part.
const	zxcvbn = new ZxcvbnFactory({
	graphs:       zxcvbnCommon.adjacencyGraphs,
	dictionary:
	{
		...zxcvbnCommon.dictionary,
		...zxcvbnEn.dictionary,
		...zxcvbnIt.dictionary,
		...zxcvbnFr.dictionary,
		...zxcvbnEs.dictionary,
		...zxcvbnDe.dictionary,
	},
	translations: zxcvbnEn.translations, // Feedback messages in English
});

// zxcvbn scores 0..4; 3 is "safely unguessable" (about 10^8 guesses or more, safe against an
// online attack), the usual minimum for an account password.
const	MIN_PASSWORD_SCORE = 3;

// Helper methods used just by this class
export async function hashPassword(password: string): Promise<string>
{
	const saltRounds = 10;
	return (await bcrypt.hash(password, saltRounds));
}

export async function comparePasswords(password: string, hash: string): Promise<boolean>
{
	try
	{
		return (await bcrypt.compare(password, hash));
	}
	catch (error)
	{
		// If the hash is invalid (e.g. from seeds), it's definitely not a match
		return (false);
	}
}

// userInputs are the user's own details (username, email, names): a password built from them,
// like "marco1998", is as guessable as a dictionary word.
export async function validatePassword(password: string, previousPasswordHash: string = null, userInputs: string[] = []): Promise<void>
{
	const	result = zxcvbn.check(password, userInputs.filter(Boolean));

	if (result.score < MIN_PASSWORD_SCORE)
	{
		const	reason = result.feedback.warning || 'This password is too easy to guess.';

		throw new BadRequestException(`${reason} Please choose a more secure password.`, 'COMMON_PASSWORD');
	}

	// Check during psw reset
	if (previousPasswordHash && await comparePasswords(password, previousPasswordHash))
		throw new BadRequestException('The new password must be different from the previous one.', 'PASSWORD_REUSE');
}
