import { UseGuards } from '@nestjs/common';
import { Resolver, Query, Mutation, Args, Subscription } from '@nestjs/graphql';
import { PostsService } from './posts.service';
import { ApiKeyGuard } from 'src/helpers/ApiKeyGuard';
import { Post, NewPost, UpdatePost } from 'src/graphql.schema';
import { PubSub } from 'graphql-subscriptions';

const pubSub = new PubSub();

@Resolver('Post')
export class PostsResolvers {
  constructor(private readonly postService: PostsService) {}

  @Query('posts')
  async posts(): Promise<Post[]> {
    return this.postService.findAll();
  }

  @Query('post')
  async post(@Args('id') args: string): Promise<Post> {
    return this.postService.findOne(args);
  }

  @Mutation('createPost')
  @UseGuards(ApiKeyGuard)
  async create(@Args('input') args: NewPost): Promise<Post> {
    const createdPost = await this.postService.create(args);
    pubSub.publish('postCreated', { postCreated: createdPost });
    return createdPost;
  }

  @Mutation('updatePost')
  @UseGuards(ApiKeyGuard)
  async update(@Args('input') args: UpdatePost): Promise<Post> {
    return this.postService.update(args);
  }

  @Mutation('deletePost')
  @UseGuards(ApiKeyGuard)
  async delete(@Args('id') args: string): Promise<Post> {
    return this.postService.delete(args);
  }

  @Subscription('postCreated')
  postCreated() {
    return pubSub.asyncIterator('postCreated');
  }
}
