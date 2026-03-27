type randomTSType = {
	first: {
		a: number,
		b: number,
		c: number
	},
	second: string
}

export default class Main {
	onInit(): void {
		const z : randomTSType = {
			first: {
				a: 1,
				b: 2,
				c: 3
			},
			second: "test"
		};
		console.log(z.first.a);
	}
}
