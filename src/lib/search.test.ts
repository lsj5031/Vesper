import { describe, it, expect } from 'vitest';
import { tokenize } from './search';

describe('search - tokenize', () => {
	describe('basic tokenization', () => {
		it('should handle empty string', () => {
			expect(tokenize('')).toEqual([]);
		});

		it('should handle simple text', () => {
			expect(tokenize('Hello World')).toEqual(['hello', 'world']);
		});

		it('should convert to lowercase', () => {
			expect(tokenize('HELLO World')).toEqual(['hello', 'world']);
		});
	});

	describe('HTML removal', () => {
		it('should strip HTML tags', () => {
			expect(tokenize('<p>Hello <b>world</b></p>')).toEqual(['hello', 'world']);
		});

		it('should handle nested HTML', () => {
			expect(tokenize('<div><p>Hello</p><p>world</p></div>')).toEqual(['hello', 'world']);
		});

		it('should handle self-closing tags', () => {
			expect(tokenize('Hello<br/>world')).toEqual(['hello', 'world']);
		});
	});

	describe('punctuation removal', () => {
		it('should remove basic punctuation', () => {
			expect(tokenize('Hello, world!')).toEqual(['hello', 'world']);
		});

		it('should handle special characters', () => {
			expect(tokenize('Hello@world#test')).toEqual(['hello', 'world', 'test']);
		});

		it('should keep alphanumeric characters', () => {
			expect(tokenize('Test123')).toEqual(['test123']);
		});
	});

	describe('stop word filtering', () => {
		it('should remove common stop words', () => {
			expect(tokenize('The quick brown fox')).toEqual(['quick', 'brown', 'fox']);
		});

		it('should filter "and", "or", "the"', () => {
			expect(tokenize('cats and dogs')).toEqual(['cats', 'dogs']);
		});

		it('should handle case-insensitive stop words', () => {
			expect(tokenize('THE quick AND brown')).toEqual(['quick', 'brown']);
		});
	});

	describe('word length filtering', () => {
		it('should filter single-character words', () => {
			expect(tokenize('a big cat')).toEqual(['big', 'cat']);
		});

		it('should keep words with 2+ characters', () => {
			expect(tokenize('an big cat')).toEqual(['big', 'cat']);
		});
	});

	describe('uniqueness', () => {
		it('should return unique tokens', () => {
			expect(tokenize('hello world hello')).toEqual(['hello', 'world']);
		});

		it('should handle repeated words with different cases', () => {
			expect(tokenize('Hello HELLO world')).toEqual(['hello', 'world']);
		});
	});

	describe('real-world cases', () => {
		it('should handle article title with HTML', () => {
			const html = '<h1>Breaking News: Tech Giant Announces New AI Product</h1>';
			expect(tokenize(html)).toContain('breaking');
			expect(tokenize(html)).toContain('tech');
			expect(tokenize(html)).toContain('ai');
		});

		it('should handle mixed content', () => {
			const content = '<p>Start with <strong>HTML</strong>, end with text.</p>';
			const tokens = tokenize(content);
			expect(tokens).toContain('start');
			expect(tokens).toContain('html');
			expect(tokens).toContain('text');
		});

		it('should handle unicode characters', () => {
			expect(tokenize('café résumé')).toEqual(['café', 'résumé']);
		});
	});
});
